
const session = require("express-session");
const { rateLimit } = require("express-rate-limit");
const argon2 = require("argon2");
const oracledb = require("oracledb");

module.exports = function postaviPrijavu(app, port) {

    if (!process.env.SESSION_SECRET ||
        process.env.SESSION_SECRET.length < 64) {
        throw new Error("Dodaj generirani SESSION_SECRET u .env.");
    }

    // KORISNICKA SESIJA
    app.use(session({
        name: "slatke.sid",
        secret: process.env.SESSION_SECRET,
        resave: false,
        saveUninitialized: false,
        cookie: {
            httpOnly: true,
            sameSite: "strict",
            secure: false,
            maxAge: 8 * 60 * 60 * 1000
        }
    }));

    // ZASTITA LOKALNE APLIKACIJE
    app.use((req, res, next) => {
        if (["POST", "PATCH", "PUT", "DELETE"].includes(req.method)) {
            const dozvoljeni = [
                `http://127.0.0.1:${port}`,
                `http://localhost:${port}`
            ];

            if (!dozvoljeni.includes(req.get("origin"))) {
                return res.status(403).json({
                    poruka: "Zahtjev nije dopušten s ove adrese."
                });
            }
        }

        next();
    });

    // POVEZIVANJE S ORACLE BAZOM
    async function sBazom(radnja) {
        let connection;

        try {
            connection = await oracledb.getConnection({
                user: process.env.DB_USER,
                password: process.env.DB_PASSWORD,
                connectString: process.env.DB_CONNECT_STRING
            });

            return await radnja(connection);

        } finally {
            if (connection) {
                try {
                    await connection.close();
                } catch (greska) {
                    console.error("Zatvaranje veze:", greska.message);
                }
            }
        }
    }

    // OGRANICENJE POKUSAJA PRIJAVE
    const ogranicenjePrijave = rateLimit({
        windowMs: 15 * 60 * 1000,
        limit: 10,
        skipSuccessfulRequests: true,
        standardHeaders: "draft-8",
        legacyHeaders: false,
        message: {
            poruka: "Previše pokušaja prijave. Pokušajte za 15 minuta."
        }
    });

    // PRIJAVA ADMINISTRATORA I SLASTICARKE
    app.post("/api/prijava", ogranicenjePrijave, async (req, res) => {

        const { email, lozinka } = req.body || {};

        if (
            typeof email !== "string" ||
            email.length > 254 ||
            typeof lozinka !== "string" ||
            lozinka.length === 0 ||
            lozinka.length > 128
        ) {
            return res.status(400).json({
                poruka: "Unesite email i lozinku."
            });
        }

        try {
            const korisnik = await sBazom(async (connection) => {

                const rezultat = await connection.execute(
                    `SELECT
                        k.id,
                        k.lozinka_hash,
                        k.uloga,
                        k.aktivan,
                        k.slasticarka_id,
                        s.aktivna AS slasticarka_aktivna
                     FROM korisnici k
                     LEFT JOIN slasticarke s
                        ON s.id = k.slasticarka_id
                     WHERE k.email = :email`,
                    {
                        email: email.trim().toLowerCase()
                    },
                    {
                        outFormat: oracledb.OUT_FORMAT_OBJECT
                    }
                );

                return rezultat.rows[0];
            });

            // PROVJERA LOZINKE
            const ispravna = korisnik
                ? await argon2.verify(
                    korisnik.LOZINKA_HASH,
                    lozinka
                )
                : false;

            // PROVJERA PRAVA PRISTUPA
            if (
                !ispravna ||
                korisnik.AKTIVAN !== 1 ||
                !["admin", "slasticarka"].includes(korisnik.ULOGA) ||
                (
                    korisnik.ULOGA === "slasticarka" &&
                    (
                        !Number.isSafeInteger(korisnik.SLASTICARKA_ID) ||
                        korisnik.SLASTICARKA_AKTIVNA !== 1
                    )
                )
            ) {
                return res.status(401).json({
                    poruka: "Neispravni podaci ili račun nema pristup."
                });
            }

            // STVARANJE NOVE SESIJE
            await new Promise((resolve, reject) => {
                req.session.regenerate((greska) => {
                    if (greska) {
                        return reject(greska);
                    }
                    resolve();
                });
            });

            req.session.korisnikId = korisnik.ID;

            await new Promise((resolve, reject) => {
                req.session.save((greska) => {
                    if (greska) {
                        return reject(greska);
                    }
                    resolve();
                });
            });

            res.json({
                poruka: "Prijava uspješna."
            });

        } catch (greska) {
            console.error("Greška prijave:", greska.message);

            res.status(500).json({
                poruka: "Prijava trenutno nije moguća."
            });
        }
    });

    // ODJAVA
    app.post("/api/odjava", (req, res) => {

        req.session.destroy((greska) => {
            if (greska) {
                return res.status(500).json({
                    poruka: "Odjava nije uspjela."
                });
            }

            res.clearCookie("slatke.sid", {
                path: "/",
                httpOnly: true,
                sameSite: "strict",
                secure: false
            });

            res.json({
                poruka: "Odjavljeni ste."
            });
        });
    });

    // PROVJERA PRIJAVLJENOG KORISNIKA
    async function zahtijevajKorisnika(req, res, next) {

        const jeApi = req.originalUrl
            .toLowerCase()
            .startsWith("/api/");

        res.set("Cache-Control", "no-store");

        if (!req.session.korisnikId) {
            return jeApi
                ? res.status(401).json({
                    poruka: "Potrebna je prijava."
                })
                : res.redirect("/prijava.html");
        }

        try {
            const korisnik = await sBazom(async (connection) => {

                const rezultat = await connection.execute(
                    `SELECT
                        k.id,
                        k.ime,
                        k.uloga,
                        k.slasticarka_id,
                        s.aktivna AS slasticarka_aktivna
                     FROM korisnici k
                     LEFT JOIN slasticarke s
                        ON s.id = k.slasticarka_id
                     WHERE k.id = :id
                       AND k.aktivan = 1`,
                    {
                        id: req.session.korisnikId
                    },
                    {
                        outFormat: oracledb.OUT_FORMAT_OBJECT
                    }
                );

                return rezultat.rows[0];
            });

            if (
                !korisnik ||
                !["admin", "slasticarka"].includes(korisnik.ULOGA) ||
                (
                    korisnik.ULOGA === "slasticarka" &&
                    (
                        !Number.isSafeInteger(korisnik.SLASTICARKA_ID) ||
                        korisnik.SLASTICARKA_AKTIVNA !== 1
                    )
                )
            ) {
                return res.status(403).json({
                    poruka: "Nemate pristup."
                });
            }

            req.korisnik = {
                id: korisnik.ID,
                ime: korisnik.IME,
                uloga: korisnik.ULOGA,
                slasticarkaId: korisnik.SLASTICARKA_ID
            };

            next();

        } catch (greska) {
            console.error("Provjera pristupa:", greska.message);

            res.status(500).json({
                poruka: "Provjera pristupa nije uspjela."
            });
        }
    }

    // PRISTUP SAMO ADMINISTRATORU
    function zahtijevajAdmina(req, res, next) {

        return zahtijevajKorisnika(req, res, () => {

            if (req.korisnik.uloga !== "admin") {
                return res.status(403).json({
                    poruka: "Uređivanje ponude dostupno je samo administratorici."
                });
            }

            next();
        });
    }

    // PODACI TRENUTNO PRIJAVLJENOG KORISNIKA
    app.get("/api/ja", zahtijevajKorisnika, (req, res) => {
        res.json(req.korisnik);
    });

    // PRISTUP NARUDZBAMA
    app.use("/api/narudzbe", (req, res, next) => {

        // Kupci mogu slati nove narudzbe bez prijave.
        if (req.method === "POST" && req.path === "/") {
            return next();
        }

        // Pregled i izmjene zahtijevaju prijavu.
        return zahtijevajKorisnika(req, res, next);
    });

    // ADMINISTRATORSKE FUNKCIJE
    app.use("/api/admin", zahtijevajAdmina);

    // PREGLED NARUDZBI
    app.get(
        ["/", "/index.html"],
        zahtijevajKorisnika
    );

    // UREDIVANJE PROIZVODA
    app.get(
        "/proizvodi.html",
        zahtijevajAdmina
    );
};
