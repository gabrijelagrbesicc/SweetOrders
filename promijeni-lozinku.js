
const oracledb = require("oracledb");
const argon2 = require("argon2");
const path = require("path");

require("dotenv").config({
    path: path.join(__dirname, ".env")
});

async function promijeniLozinku() {
    let connection;

    try {
        const novaLozinka =
            process.env.NOVA_LOZINKA_SLASTICARKE || "";

        if (novaLozinka.length < 15 || novaLozinka.length > 128) {
            throw new Error("Lozinka mora imati 15 do 128 znakova.");
        }

        connection = await oracledb.getConnection({
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            connectString: process.env.DB_CONNECT_STRING
        });

        const hash = await argon2.hash(novaLozinka, {
            type: argon2.argon2id,
            memoryCost: 65536,
            timeCost: 3,
            parallelism: 1
        });

        const rezultat = await connection.execute(
            `UPDATE korisnici
             SET lozinka_hash = :hash
             WHERE id = :id
             AND email = :email
             AND uloga = 'slasticarka'`,
            {
                hash: hash,
                id: 21,
                email: "gabrijelafaks@gmail.com"
            }
        );

        if (rezultat.rowsAffected !== 1) {
            await connection.rollback();
            throw new Error("Račun nije pronađen. Lozinka nije promijenjena.");
        }

        await connection.commit();

        console.log("Lozinka slastičarke uspješno je promijenjena!");

    } catch (greska) {
        console.error("Greška:", greska.message);
    } finally {
        if (connection) {
            await connection.close();
        }
    }
}

promijeniLozinku();
