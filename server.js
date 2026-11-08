const express = require("express");
const oracledb = require("oracledb");
const path = require("path");

require("dotenv").config({
    path: path.join(__dirname, ".env")
});

const app = express();
const port = Number(process.env.PORT) || 3000;

app.use(express.json({ limit: "50kb" }));

require("./auth")(app, port);

app.use(express.static(path.join(__dirname, "public")));

app.get("/api/narudzbe", async (req, res) => {
    let connection;

    try {
        connection = await oracledb.getConnection({
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            connectString: process.env.DB_CONNECT_STRING
        });

        const narudzbe = await connection.execute(
            `SELECT *
             FROM narudzbe
             ORDER BY
                CASE WHEN status = 'ceka potvrdu' THEN 0 ELSE 1 END,
                datum_preuzimanja ASC`,
            [],
            { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );

        const stavke = await connection.execute(
            `SELECT *
             FROM stavke_narudzbe
             ORDER BY id`,
            [],
            { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );

        const rezultat = narudzbe.rows.map((narudzba) => ({
            ...narudzba,
            STAVKE: stavke.rows.filter(
                (stavka) => stavka.NARUDZBA_ID === narudzba.ID
            )
        }));

        res.json(rezultat);
    } catch (greska) {
        console.error("Greška čitanja narudžbi:", greska.message);

        res.status(500).json({
            poruka: "Nije moguće dohvatiti narudžbe."
        });
    } finally {
        if (connection) {
            try {
                await connection.close();
            } catch (greska) {
                console.error("Greška zatvaranja:", greska.message);
            }
        }
    }
});
app.get("/api/ponuda/:oznaka", async (req, res) => {
    let connection;

    try {
        connection = await oracledb.getConnection({
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            connectString: process.env.DB_CONNECT_STRING
        });

        const slasticarka = await connection.execute(
            `SELECT id, naziv, telefon, grad, opis
             FROM slasticarke
             WHERE oznaka_linka = :oznaka
               AND aktivna = 1`,
            { oznaka: req.params.oznaka },
            { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );

        if (slasticarka.rows.length === 0) {
            return res.status(404).json({
                poruka: "Ponuda nije pronađena."
            });
        }

        const vlasnica = slasticarka.rows[0];

        const proizvodi = await connection.execute(
            `SELECT id, naziv, opis, kategorija, cijena,
                    jedinica, minimalna_kolicina, slika_url
             FROM proizvodi
             WHERE slasticarka_id = :slasticarkaId
               AND dostupan = 1
             ORDER BY kategorija DESC, naziv ASC`,
            { slasticarkaId: vlasnica.ID },
            { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );

        res.json({
            slasticarka: vlasnica,
            proizvodi: proizvodi.rows
        });
    } catch (greska) {
        console.error("Greška pri dohvaćanju ponude:", greska.message);

        res.status(500).json({
            poruka: "Nije moguće dohvatiti ponudu."
        });
    } finally {
        if (connection) {
            try {
                await connection.close();
            } catch (greska) {
                console.error("Greška pri zatvaranju veze:", greska.message);
            }
        }
    }
});
app.post("/api/narudzbe", async (req, res) => {
    let connection;

    function odbij(poruka) {
        const greska = new Error(poruka);
        greska.status = 400;
        throw greska;
    }

    try {
        const {
            oznaka,
            ime,
            telefon,
            datumPreuzimanja,
            napomena,
            stavke
        } = req.body || {};

        // Provjera podataka kupca.
        if (
            typeof ime !== "string" ||
            ime.trim().length < 2 ||
            ime.trim().length > 100
        ) {
            odbij("Unesite ime i prezime, najviše 100 znakova.");
        }

        if (
            typeof telefon !== "string" ||
            telefon.length > 30 ||
            !/^[+\d\s()/-]+$/.test(telefon) ||
            telefon.replace(/\D/g, "").length < 6 ||
            telefon.replace(/\D/g, "").length > 15
        ) {
            odbij("Provjerite broj telefona.");
        }

        if (
            typeof oznaka !== "string" ||
            oznaka.length === 0 ||
            oznaka.length > 100
        ) {
            odbij("Nije odabrana slastičarka.");
        }

        if (
            napomena !== undefined &&
            (typeof napomena !== "string" || napomena.length > 1000)
        ) {
            odbij("Napomena može imati najviše 1000 znakova.");
        }

        // Frontend će poslati termin u ISO formatu s oznakom Z.
        if (
            typeof datumPreuzimanja !== "string" ||
            !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(
                datumPreuzimanja
            )
        ) {
            odbij("Datum preuzimanja nije ispravan.");
        }

        const datum = new Date(datumPreuzimanja);

        if (
            Number.isNaN(datum.getTime()) ||
            datum.toISOString() !== datumPreuzimanja ||
            datum.getTime() <= Date.now()
        ) {
            odbij("Odaberite termin u budućnosti.");
        }

        if (
            !Array.isArray(stavke) ||
            stavke.length === 0 ||
            stavke.length > 50
        ) {
            odbij("Košarica mora sadržavati između 1 i 50 proizvoda.");
        }

        const vidjeniId = new Set();

        for (const stavka of stavke) {
            if (
                !stavka ||
                !Number.isSafeInteger(stavka.proizvodId) ||
                stavka.proizvodId <= 0 ||
                typeof stavka.kolicina !== "number" ||
                !Number.isFinite(stavka.kolicina) ||
                stavka.kolicina <= 0 ||
                stavka.kolicina > 1000
            ) {
                odbij("Proizvod ili količina nisu ispravni.");
            }

            if (vidjeniId.has(stavka.proizvodId)) {
                odbij("Isti proizvod ne smije biti naveden dvaput.");
            }

            vidjeniId.add(stavka.proizvodId);
        }

        connection = await oracledb.getConnection({
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            connectString: process.env.DB_CONNECT_STRING
        });

        const rezultatVlasnice = await connection.execute(
            `SELECT id
             FROM slasticarke
             WHERE oznaka_linka = :oznaka
               AND aktivna = 1`,
            { oznaka },
            { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );

        if (rezultatVlasnice.rows.length === 0) {
            odbij("Slastičarka trenutno nije dostupna.");
        }

        const slasticarkaId = rezultatVlasnice.rows[0].ID;
        const provjereneStavke = [];
        let ukupnoFeninga = 0;

        // Cijene čitamo iz baze, ne iz kupčeva preglednika.
        for (const stavka of stavke) {
            const rezultatProizvoda = await connection.execute(
                `SELECT id, naziv, cijena, jedinica, minimalna_kolicina
                 FROM proizvodi
                 WHERE id = :id
                   AND slasticarka_id = :slasticarkaId
                   AND dostupan = 1`,
                {
                    id: stavka.proizvodId,
                    slasticarkaId
                },
                { outFormat: oracledb.OUT_FORMAT_OBJECT }
            );

            if (rezultatProizvoda.rows.length === 0) {
                odbij("Jedan od proizvoda više nije dostupan.");
            }

            const proizvod = rezultatProizvoda.rows[0];

            if (stavka.kolicina < proizvod.MINIMALNA_KOLICINA) {
                odbij("Količina je manja od minimalne za: " + proizvod.NAZIV);
            }

            if (
                proizvod.JEDINICA === "kg"
                    ? !Number.isInteger(stavka.kolicina * 2)
                    : !Number.isInteger(stavka.kolicina)
            ) {
                odbij("Neispravan korak količine za: " + proizvod.NAZIV);
            }

            ukupnoFeninga += Math.round(
                proizvod.CIJENA * stavka.kolicina * 100
            );

            provjereneStavke.push({
                proizvod,
                kolicina: stavka.kolicina
            });
        }

        if (ukupnoFeninga > 9999999999) {
            odbij("Ukupan iznos narudžbe je prevelik.");
        }

        // Spremamo glavne podatke narudžbe.
        const rezultatNarudzbe = await connection.execute(
            `INSERT INTO narudzbe (
                slasticarka_id, ime_kupca, telefon, proizvod,
                opis, datum_preuzimanja, cijena, predujam, status
             )
             VALUES (
                :slasticarkaId, :ime, :telefon, :proizvod,
                :opis, :datum, :cijena, 0, 'ceka potvrdu'
             )
             RETURNING id INTO :noviId`,
            {
                slasticarkaId,
                ime: ime.trim(),
                telefon: telefon.trim(),
                proizvod: "Narudžba iz ponude",
                opis: napomena ? napomena.trim() : null,
                datum: {
                    val: datum,
                    type: oracledb.DB_TYPE_TIMESTAMP
                },
                cijena: ukupnoFeninga / 100,
                noviId: {
                    dir: oracledb.BIND_OUT,
                    type: oracledb.NUMBER
                }
            },
            { autoCommit: false }
        );

        const narudzbaId = rezultatNarudzbe.outBinds.noviId[0];

        // Spremamo proizvode koji pripadaju toj narudžbi.
        for (const stavka of provjereneStavke) {
            await connection.execute(
                `INSERT INTO stavke_narudzbe (
                    narudzba_id, proizvod_id, naziv_proizvoda,
                    jedinica, kolicina, jedinicna_cijena
                 )
                 VALUES (
                    :narudzbaId, :proizvodId, :naziv,
                    :jedinica, :kolicina, :cijena
                 )`,
                {
                    narudzbaId,
                    proizvodId: stavka.proizvod.ID,
                    naziv: stavka.proizvod.NAZIV,
                    jedinica: stavka.proizvod.JEDINICA,
                    kolicina: stavka.kolicina,
                    cijena: stavka.proizvod.CIJENA
                },
                { autoCommit: false }
            );
        }

        // Potvrđujemo tek kada je spremljeno sve.
        await connection.commit();

        res.status(201).json({
            poruka: "Zahtjev je poslan i čeka potvrdu slastičarke.",
            narudzbaId,
            ukupno: ukupnoFeninga / 100
        });
    } catch (greska) {
        if (connection) {
            try {
                await connection.rollback();
            } catch (rollbackGreska) {
                console.error("Greška poništavanja:", rollbackGreska.message);
            }
        }

        console.error("Greška narudžbe:", greska.message);

        res.status(greska.status === 400 ? 400 : 500).json({
            poruka: greska.status === 400
                ? greska.message
                : "Narudžbu nije moguće spremiti. Pokušajte ponovno."
        });
    } finally {
        if (connection) {
            try {
                await connection.close();
            } catch (greska) {
                console.error("Greška zatvaranja:", greska.message);
            }
        }
    }
});
app.patch("/api/narudzbe/:id/status", async (req, res) => {
    const id = Number(req.params.id);
    const status = req.body?.status;

    if (!Number.isSafeInteger(id) || id <= 0) {
        return res.status(400).json({
            poruka: "Neispravan broj narudžbe."
        });
    }

    const prethodniStatusi = {
    "dogovoreno": "ceka potvrdu",
    "otkazano": "ceka potvrdu",
    "u izradi": "dogovoreno",
    "spremno": "u izradi",
    "preuzeto": "spremno"
};

if (!Object.prototype.hasOwnProperty.call(prethodniStatusi, status)) {
    return res.status(400).json({
        poruka: "Nedopušten status."
    });
}

const prethodniStatus = prethodniStatusi[status];

    let connection;

    try {
        connection = await oracledb.getConnection({
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            connectString: process.env.DB_CONNECT_STRING
        });

        const rezultat = await connection.execute(
    `UPDATE narudzbe
     SET status = :status
     WHERE id = :id
       AND status = :prethodniStatus`,
    { status, id, prethodniStatus },
    { autoCommit: true }
);

        if (rezultat.rowsAffected === 0) {
            return res.status(409).json({
                poruka:
                    "Narudžba ne postoji ili je već obrađena. Osvježite pregled."
            });
        }

        res.json({
            poruka: "Status narudžbe uspješno je promijenjen.",
            status
            });
    } catch (greska) {
        console.error("Greška promjene statusa:", greska.message);

        res.status(500).json({
            poruka: "Nije moguće promijeniti status."
        });
    } finally {
        if (connection) {
            try {
                await connection.close();
            } catch (greska) {
                console.error("Greška zatvaranja:", greska.message);
            }
        }
    }
});
app.patch("/api/narudzbe/:id/placanje", async (req, res) => {
    const id = Number(req.params.id);

    if (!Number.isSafeInteger(id) || id <= 0) {
        return res.status(400).json({
            poruka: "Neispravan broj narudžbe."
        });
    }

    let connection;

    try {
        connection = await oracledb.getConnection({
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            connectString: process.env.DB_CONNECT_STRING
        });

        const rezultat = await connection.execute(
            `UPDATE narudzbe
             SET placeno = cijena
             WHERE id = :id
               AND placeno < cijena
               AND status IN (
                   'dogovoreno', 'u izradi', 'spremno', 'preuzeto'
               )`,
            { id },
            { autoCommit: true }
        );

        if (rezultat.rowsAffected === 0) {
            return res.status(409).json({
                poruka:
                    "Narudžba je već plaćena ili njezin status ne dopušta ovu radnju. Osvježite pregled."
            });
        }

        res.json({
            poruka: "Puna uplata je evidentirana."
        });
    } catch (greska) {
        console.error("Greška evidentiranja uplate:", greska.message);

        res.status(500).json({
            poruka: "Uplatu nije moguće evidentirati."
        });
    } finally {
        if (connection) {
            try {
                await connection.close();
            } catch (greska) {
                console.error("Greška zatvaranja:", greska.message);
            }
        }
    }
});
app.get("/api/admin/slasticarke", async (req, res) => {
    let connection;

    try {
        connection = await oracledb.getConnection({
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            connectString: process.env.DB_CONNECT_STRING
        });

        const rezultat = await connection.execute(
            `SELECT id, naziv
             FROM slasticarke
             WHERE aktivna = 1
             ORDER BY naziv`,
            [],
            { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );

        res.json(rezultat.rows);
    } catch (greska) {
        console.error(greska.message);
        res.status(500).json({
            poruka: "Nije moguće učitati slastičarke."
        });
    } finally {
        if (connection) {
            await connection.close().catch(console.error);
        }
    }
});

app.post("/api/admin/proizvodi", async (req, res) => {
    const {
        slasticarkaId,
        naziv,
        opis,
        kategorija,
        cijena,
        jedinica,
        minimalnaKolicina
    } = req.body || {};

    if (
        !Number.isSafeInteger(slasticarkaId) ||
        slasticarkaId <= 0 ||
        typeof naziv !== "string" ||
        naziv.trim().length < 2 ||
        naziv.trim().length > 150 ||
        typeof opis !== "string" ||
        opis.length > 2000 ||
        !["torta", "kolaci"].includes(kategorija) ||
        !["komad", "kg", "paket"].includes(jedinica)
    ) {
        return res.status(400).json({
            poruka: "Provjerite naziv, opis, slastičarku i vrstu proizvoda."
        });
    }

    if (
        typeof cijena !== "number" ||
        !Number.isFinite(cijena) ||
        cijena <= 0 ||
        cijena > 99999999.99 ||
        Math.abs(cijena * 100 - Math.round(cijena * 100)) > 0.00001
    ) {
        return res.status(400).json({
            poruka: "Unesite pozitivnu cijenu s najviše dvije decimale."
        });
    }

    if (
        typeof minimalnaKolicina !== "number" ||
        !Number.isFinite(minimalnaKolicina) ||
        minimalnaKolicina <= 0 ||
        minimalnaKolicina > 1000 ||
        (jedinica === "kg"
            ? !Number.isInteger(minimalnaKolicina * 2)
            : !Number.isInteger(minimalnaKolicina))
    ) {
        return res.status(400).json({
            poruka:
                "Za kg koristite korake od 0,5. Za komade i pakete unesite cijeli broj."
        });
    }

    let connection;

    try {
        connection = await oracledb.getConnection({
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            connectString: process.env.DB_CONNECT_STRING
        });

        const rezultat = await connection.execute(
            `INSERT INTO proizvodi (
                slasticarka_id, naziv, opis, kategorija,
                cijena, jedinica, minimalna_kolicina
             )
             SELECT id, :naziv, :opis, :kategorija,
                    :cijena, :jedinica, :minimalnaKolicina
             FROM slasticarke
             WHERE id = :slasticarkaId
               AND aktivna = 1`,
            {
                slasticarkaId,
                naziv: naziv.trim(),
                opis: opis.trim() || null,
                kategorija,
                cijena,
                jedinica,
                minimalnaKolicina
            },
            { autoCommit: true }
        );

        if (rezultat.rowsAffected === 0) {
            return res.status(400).json({
                poruka: "Odabrana slastičarka nije dostupna."
            });
        }

        res.status(201).json({
            poruka: "Proizvod je spremljen i objavljen u ponudi."
        });
    } catch (greska) {
        console.error("Dodavanje proizvoda:", greska.message);
        res.status(500).json({
            poruka: "Proizvod nije moguće spremiti."
        });
    } finally {
        if (connection) {
            await connection.close().catch(console.error);
        }
    }
});
app.get("/api/admin/proizvodi", async (req, res) => {
    let connection;

    try {
        connection = await oracledb.getConnection({
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            connectString: process.env.DB_CONNECT_STRING
        });

        const rezultat = await connection.execute(
            `SELECT p.id, p.naziv, p.opis, p.cijena, p.jedinica,
            p.slika_url, p.dostupan, s.naziv AS slasticarka
            FROM proizvodi p
            JOIN slasticarke s ON s.id = p.slasticarka_id
            ORDER BY s.naziv, p.naziv`,
            [],
            { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );

        res.json(rezultat.rows);
    } catch (greska) {
        console.error(greska.message);
        res.status(500).json({
            poruka: "Proizvode nije moguće učitati."
        });
    } finally {
        if (connection) {
            await connection.close().catch(console.error);
        }
    }
});

app.patch("/api/admin/proizvodi/:id/dostupnost", async (req, res) => {
    const id = Number(req.params.id);
    const dostupan = req.body?.dostupan;

    if (
        !Number.isSafeInteger(id) ||
        id <= 0 ||
        ![0, 1].includes(dostupan)
    ) {
        return res.status(400).json({
            poruka: "Neispravan proizvod ili dostupnost."
        });
    }

    let connection;

    try {
        connection = await oracledb.getConnection({
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            connectString: process.env.DB_CONNECT_STRING
        });

        const rezultat = await connection.execute(
            `UPDATE proizvodi
             SET dostupan = :dostupan
             WHERE id = :id`,
            { dostupan, id },
            { autoCommit: true }
        );

        if (rezultat.rowsAffected === 0) {
            return res.status(404).json({
                poruka: "Proizvod nije pronađen."
            });
        }

        res.json({
            poruka: dostupan === 1
                ? "Proizvod je vraćen u ponudu."
                : "Proizvod je skriven iz ponude."
        });
    } catch (greska) {
        console.error(greska.message);
        res.status(500).json({
            poruka: "Promjenu nije moguće spremiti."
        });
    } finally {
        if (connection) {
            await connection.close().catch(console.error);
        }
    }
});app.patch("/api/admin/proizvodi/:id", async (req, res) => {
    const id = Number(req.params.id);
    const { naziv, opis, cijena, slikaUrl = "" } = req.body || {};

    if (
    typeof slikaUrl !== "string" ||
    (
        slikaUrl !== "" &&
        !/^\/slike\/[a-zA-Z0-9_-]+\.(jpg|jpeg|png|webp)$/i.test(slikaUrl)
    )
) {
    return res.status(400).json({
        poruka:
            "Upišite putanju poput /slike/torta-jagoda.jpg ili ostavite prazno."
    });
}
    if (
        !Number.isSafeInteger(id) ||
        id <= 0 ||
        typeof naziv !== "string" ||
        naziv.trim().length < 2 ||
        naziv.trim().length > 150 ||
        typeof opis !== "string" ||
        opis.length > 2000
    ) {
        return res.status(400).json({
            poruka: "Provjerite naziv i opis proizvoda."
        });
    }

    if (
        typeof cijena !== "number" ||
        !Number.isFinite(cijena) ||
        cijena <= 0 ||
        cijena > 99999999.99 ||
        Math.abs(cijena * 100 - Math.round(cijena * 100)) > 0.00001
    ) {
        return res.status(400).json({
            poruka: "Unesite pozitivnu cijenu s najviše dvije decimale."
        });
    }

    let connection;

    try {
        connection = await oracledb.getConnection({
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            connectString: process.env.DB_CONNECT_STRING
        });

        const rezultat = await connection.execute(
    `UPDATE proizvodi
     SET naziv = :naziv,
         opis = :opis,
         cijena = :cijena,
         slika_url = :slikaUrl
     WHERE id = :id`,
    {
        id,
        naziv: naziv.trim(),
        opis: opis.trim() || null,
        cijena,
        slikaUrl: slikaUrl || null
    },
    { autoCommit: true }
);

        if (rezultat.rowsAffected === 0) {
            return res.status(404).json({
                poruka: "Proizvod nije pronađen."
            });
        }

        res.json({
            poruka: "Izmjene su spremljene."
        });
    } catch (greska) {
        console.error("Uređivanje proizvoda:", greska.message);
        res.status(500).json({
            poruka: "Izmjene nije moguće spremiti."
        });
    } finally {
        if (connection) {
            await connection.close().catch(console.error);
        }
    }
});

app.listen(port, "127.0.0.1", () => {
    console.log(`Server radi na http://127.0.0.1:${port}`);
});