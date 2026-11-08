
const oracledb = require("oracledb");
const argon2 = require("argon2");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, ".env") });

async function main() {
    let connection;

    try {
        const ime = (process.env.SLASTICARKA_IME || "").trim();
        const email = (process.env.SLASTICARKA_EMAIL || "").trim().toLowerCase();
        const lozinka = process.env.SLASTICARKA_LOZINKA || "";
        const oznaka = (process.env.SLASTICARKA_OZNAKA || "").trim();

        if (ime.length < 2 || ime.length > 100 ||
            email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
            lozinka.length < 15 || lozinka.length > 128 ||
            !oznaka || oznaka.length > 100) {
            throw new Error("Provjeri SLASTICARKA_ postavke u .env. Lozinka mora imati 15–128 znakova.");
        }

        connection = await oracledb.getConnection({
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            connectString: process.env.DB_CONNECT_STRING
        });

        const postojeci = await connection.execute(
            "SELECT id FROM korisnici WHERE email = :email",
            { email }
        );

        if (postojeci.rows.length) {
            throw new Error("Email već postoji. Postojeći račun nije promijenjen. Koristi drugi email za slastičarku.");
        }

        const vlasnica = await connection.execute(
            "SELECT id FROM slasticarke WHERE oznaka_linka = :oznaka AND aktivna = 1",
            { oznaka },
            { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );

        if (vlasnica.rows.length !== 1) {
            throw new Error("Aktivna slastičarka s tom oznakom nije pronađena. Provjeri SLASTICARKA_OZNAKA.");
        }

        const hash = await argon2.hash(lozinka, {
            type: argon2.argon2id,
            memoryCost: 65536,
            timeCost: 3,
            parallelism: 1
        });

        await connection.execute(
            `INSERT INTO korisnici (ime, email, lozinka_hash, uloga, slasticarka_id)
             VALUES (:ime, :email, :hash, 'slasticarka', :vlasnikId)`,
            {
                ime,
                email,
                hash,
                vlasnikId: vlasnica.rows[0].ID
            },
            { autoCommit: true }
        );

        console.log("Račun slastičarke uspješno je napravljen.");
        console.log("Povezan je s ponudom: " + oznaka);
        console.log("Sada ukloni četiri SLASTICARKA_ retka iz .env datoteke.");

    } catch (greska) {
        console.error(
            greska.errorNum === 1
                ? "Email već postoji. Račun nije promijenjen."
                : greska.message
        );
        process.exitCode = 1;

    } finally {
        if (connection) {
            await connection.close().catch(() => {
                console.error("Nije uspjelo zatvaranje veze s bazom.");
            });
        }
    }
}

main();
