const oracledb = require("oracledb");
const argon2 = require("argon2");
const path = require("path");

require("dotenv").config({
    path: path.join(__dirname, ".env")
});

async function napraviAdmina() {
    let connection;

    try {
        const ime = (process.env.ADMIN_IME || "").trim();
        const email = (process.env.ADMIN_EMAIL || "")
            .trim()
            .toLowerCase();

        const lozinka = process.env.ADMIN_LOZINKA || "";

        if (ime.length < 2 || ime.length > 100) {
            throw new Error("Provjeri ADMIN_IME u .env datoteci.");
        }

        if (
            email.length > 254 ||
            !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
        ) {
            throw new Error("Provjeri ADMIN_EMAIL u .env datoteci.");
        }

        if (lozinka.length < 15 || lozinka.length > 128) {
            throw new Error("Lozinka mora imati između 15 i 128 znakova.");
        }

        connection = await oracledb.getConnection({
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            connectString: process.env.DB_CONNECT_STRING
        });

        const postojeci = await connection.execute(
            `SELECT id
             FROM korisnici
             WHERE email = :email`,
            { email }
        );

        if (postojeci.rows.length > 0) {
            console.log(
                "Korisnik s tim emailom već postoji. Račun nije promijenjen."
            );
            return;
        }

        const hash = await argon2.hash(lozinka, {
            type: argon2.argon2id,
            memoryCost: 65536,
            timeCost: 3,
            parallelism: 1
        });

        await connection.execute(
            `INSERT INTO korisnici (
                ime, email, lozinka_hash, uloga, slasticarka_id
             )
             VALUES (
                :ime, :email, :hash, 'admin', NULL
             )`,
            { ime, email, hash },
            { autoCommit: true }
        );

        console.log("Administratorski račun uspješno je napravljen.");
    } catch (greska) {
        console.error(
            greska.errorNum === 1
                ? "Korisnik s tim emailom već postoji."
                : greska.message
        );

        process.exitCode = 1;
    } finally {
        if (connection) {
            try {
                await connection.close();
            } catch {
                console.error("Nije uspjelo zatvaranje veze s bazom.");
            }
        }
    }
}

napraviAdmina();