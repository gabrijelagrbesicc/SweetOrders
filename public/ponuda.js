const prikazProizvoda = document.getElementById("proizvodi");
const porukaPonude = document.getElementById("poruka-ponude");

const parametri = new URLSearchParams(window.location.search);
const oznaka = parametri.get("slasticarka") || "probna-slasticarnica";

function formatirajCijenu(cijena) {
    return Number(cijena).toLocaleString("hr-HR", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    }) + " KM";
}

async function ucitajPonudu() {
    try {
        const odgovor = await fetch(
            `/api/ponuda/${encodeURIComponent(oznaka)}`
        );

        if (odgovor.status === 404) {
            porukaPonude.textContent = "Ova ponuda nije pronađena.";
            return;
        }

        if (!odgovor.ok) {
            throw new Error("Ponudu nije moguće dohvatiti.");
        }

        const podaci = await odgovor.json();

        document.getElementById("naziv-slasticarke").textContent =
            podaci.slasticarka.NAZIV;

        document.getElementById("opis-slasticarke").textContent =
            podaci.slasticarka.OPIS || "";

        document.getElementById("grad-slasticarke").textContent =
            podaci.slasticarka.GRAD || "";

        document.title = podaci.slasticarka.NAZIV + " — Ponuda";

        prikazProizvoda.replaceChildren();

        if (podaci.proizvodi.length === 0) {
            porukaPonude.textContent =
                "Trenutno nema dostupnih proizvoda.";
            return;
        }

        porukaPonude.textContent = "";

        for (const proizvod of podaci.proizvodi) {
            const kartica = document.createElement("article");
            kartica.className = "kartica";

            const ilustracija = document.createElement("div");
ilustracija.className = "ilustracija-proizvoda";

function prikaziZamjenskuSliku() {
    ilustracija.replaceChildren();
    ilustracija.textContent =
        proizvod.KATEGORIJA === "torta" ? "🎂" : "🍪";
    ilustracija.setAttribute("aria-hidden", "true");
}

const ispravnaPutanja =
    typeof proizvod.SLIKA_URL === "string" &&
    /^\/slike\/[a-zA-Z0-9_-]+\.(jpg|jpeg|png|webp)$/i.test(
        proizvod.SLIKA_URL
    );

if (ispravnaPutanja) {
    const fotografija = document.createElement("img");
    fotografija.alt = proizvod.NAZIV;
    fotografija.loading = "lazy";
    fotografija.addEventListener("error", prikaziZamjenskuSliku);
    fotografija.src = proizvod.SLIKA_URL;

    ilustracija.appendChild(fotografija);
} else {
    prikaziZamjenskuSliku();
}

            const kategorija = document.createElement("span");
            kategorija.className = "status";
            kategorija.textContent =
                proizvod.KATEGORIJA === "torta" ? "Torta" : "Kolači";

            const naziv = document.createElement("h3");
            naziv.textContent = proizvod.NAZIV;

            const opis = document.createElement("p");
            opis.textContent = proizvod.OPIS || "";

            const cijena = document.createElement("p");
            cijena.className = "cijena-proizvoda";
            cijena.textContent =
                formatirajCijenu(proizvod.CIJENA) +
                " / " + proizvod.JEDINICA;

            const minimum = document.createElement("p");
            minimum.className = "minimum-proizvoda";
            minimum.textContent =
                "Minimalna količina: " +
                proizvod.MINIMALNA_KOLICINA +
                " " + proizvod.JEDINICA;

            kartica.append(
                ilustracija,
                kategorija,
                naziv,
                opis,
                cijena,
                minimum
            );
            const odabir = document.createElement("form");
odabir.className = "odabir-proizvoda";

const oznakaKolicine = document.createElement("label");
oznakaKolicine.htmlFor = "kolicina-" + proizvod.ID;
oznakaKolicine.textContent =
    "Količina (" + proizvod.JEDINICA + ")";

const unosKolicine = document.createElement("input");
unosKolicine.id = "kolicina-" + proizvod.ID;
unosKolicine.type = "number";
unosKolicine.min = proizvod.MINIMALNA_KOLICINA;
unosKolicine.step = proizvod.JEDINICA === "kg" ? "0.5" : "1";
unosKolicine.value = proizvod.MINIMALNA_KOLICINA;
unosKolicine.required = true;

const dodaj = document.createElement("button");
dodaj.type = "submit";
dodaj.textContent = "Dodaj u košaricu";

const potvrda = document.createElement("p");
potvrda.className = "potvrda-dodavanja";
potvrda.setAttribute("role", "status");

odabir.addEventListener("submit", (dogadaj) => {
    dogadaj.preventDefault();

    if (!odabir.reportValidity()) {
        return;
    }

    const kolicina = Number(unosKolicine.value);

    if (!Number.isFinite(kolicina) || kolicina <= 0) {
        return;
    }

    dodajUKosaricu(proizvod, kolicina);

    potvrda.textContent =
        "Dodano: " + kolicina.toLocaleString("hr-HR") +
        " " + proizvod.JEDINICA + ".";
});

odabir.append(oznakaKolicine, unosKolicine, dodaj);
kartica.append(odabir, potvrda);
            prikazProizvoda.appendChild(kartica);
        }
    } catch (greska) {
        porukaPonude.textContent =
            "Ponuda se nije učitala. Pokušajte osvježiti stranicu.";
        console.error(greska);
    }
}

ucitajPonudu();

const kosarica = new Map();

function dodajUKosaricu(proizvod, kolicina) {
    const postojecaStavka = kosarica.get(proizvod.ID);

    if (postojecaStavka) {
        postojecaStavka.kolicina =
            Math.round((postojecaStavka.kolicina + kolicina) * 100) / 100;
    } else {
        kosarica.set(proizvod.ID, {
            proizvod: proizvod,
            kolicina: kolicina
        });
    }

    prikaziKosaricu();
}

function prikaziKosaricu() {
    const prikaz = document.getElementById("stavke-kosarice");
    const praznaPoruka = document.getElementById("prazna-kosarica");

    prikaz.replaceChildren();
    praznaPoruka.hidden = kosarica.size > 0;

    let ukupnoFeninga = 0;

    for (const [id, stavka] of kosarica) {
        const proizvod = stavka.proizvod;

        const iznosFeninga = Math.round(
            proizvod.CIJENA * stavka.kolicina * 100
        );

        ukupnoFeninga += iznosFeninga;

        const red = document.createElement("div");
        red.className = "stavka-kosarice";

        const tekst = document.createElement("p");
        tekst.textContent =
            proizvod.NAZIV + " — " +
            stavka.kolicina.toLocaleString("hr-HR") + " " +
            proizvod.JEDINICA + " — " +
            formatirajCijenu(iznosFeninga / 100);

        const ukloni = document.createElement("button");
        ukloni.type = "button";
        ukloni.className = "gumb-ukloni";
        ukloni.textContent = "Ukloni";
        ukloni.setAttribute(
            "aria-label",
            "Ukloni iz košarice: " + proizvod.NAZIV
        );

        ukloni.addEventListener("click", () => {
            kosarica.delete(id);
            prikaziKosaricu();
        });

        red.append(tekst, ukloni);
        prikaz.appendChild(red);
    }

    document.getElementById("ukupno-kosarica").textContent =
        "Ukupno: " + formatirajCijenu(ukupnoFeninga / 100);
}

const formaNarudzbe = document.getElementById("forma-narudzbe");
const porukaNarudzbe = document.getElementById("poruka-narudzbe");
const gumbPosalji = formaNarudzbe.querySelector('button[type="submit"]');

let slanjeUTijeku = false;

formaNarudzbe.addEventListener("submit", async (dogadaj) => {
    dogadaj.preventDefault();

    if (slanjeUTijeku) {
        return;
    }

    porukaNarudzbe.textContent = "";

    if (!formaNarudzbe.reportValidity()) {
        return;
    }

    if (kosarica.size === 0) {
        porukaNarudzbe.textContent =
            "Prvo dodajte barem jedan proizvod u košaricu.";
        return;
    }

    const ime = document.getElementById("ime-kupca").value.trim();
    const telefon =
        document.getElementById("telefon-kupca").value.trim();

    const napomena =
        document.getElementById("napomena-kupca").value.trim();

    const datumUnos =
        document.getElementById("datum-preuzimanja").value;

    const datum = new Date(datumUnos);

    if (ime.length < 2) {
        porukaNarudzbe.textContent = "Unesite ime i prezime.";
        return;
    }

    const brojZnamenki = telefon.replace(/\D/g, "").length;

    if (
        !/^[+\d\s()/-]+$/.test(telefon) ||
        brojZnamenki < 6 ||
        brojZnamenki > 15
    ) {
        porukaNarudzbe.textContent = "Provjerite broj telefona.";
        return;
    }

    if (
        Number.isNaN(datum.getTime()) ||
        datum.getTime() <= Date.now()
    ) {
        porukaNarudzbe.textContent =
            "Odaberite datum i vrijeme u budućnosti.";
        return;
    }

    const stavke = Array.from(kosarica.values()).map((stavka) => ({
        proizvodId: stavka.proizvod.ID,
        kolicina: stavka.kolicina
    }));

    const podaci = {
        oznaka: oznaka,
        ime: ime,
        telefon: telefon,
        datumPreuzimanja: datum.toISOString(),
        napomena: napomena,
        stavke: stavke
    };

    slanjeUTijeku = true;

    // Zaključavamo unos i košaricu dok traje slanje.
    const kontrole = Array.from(
        document.querySelectorAll("input, textarea, select, button")
    );

    const prethodnaStanja = kontrole.map((kontrola) => kontrola.disabled);

    kontrole.forEach((kontrola) => {
        kontrola.disabled = true;
    });

    gumbPosalji.textContent = "Slanje...";
    porukaNarudzbe.textContent = "Spremanje zahtjeva...";

    try {
        const odgovor = await fetch("/api/narudzbe", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify(podaci)
        });

        const rezultat = await odgovor.json();

        if (!odgovor.ok) {
            porukaNarudzbe.textContent =
                rezultat.poruka || "Zahtjev nije spremljen.";
            return;
        }

        if (
            odgovor.status !== 201 ||
            !Number.isSafeInteger(rezultat.narudzbaId) ||
            typeof rezultat.ukupno !== "number"
        ) {
            throw new Error("Neočekivan odgovor servera.");
        }

        kosarica.clear();
        prikaziKosaricu();
        formaNarudzbe.reset();

        porukaNarudzbe.textContent =
            "Zahtjev broj " + rezultat.narudzbaId +
            " uspješno je poslan. Ukupan iznos: " +
            formatirajCijenu(rezultat.ukupno) +
            ". Narudžba i termin čekaju potvrdu slastičarke.";

        document.querySelectorAll(".potvrda-dodavanja").forEach(
            (element) => {
                element.textContent = "";
            }
        );
    } catch (greska) {
        console.error(greska);

        porukaNarudzbe.textContent =
            "Nije moguće potvrditi je li zahtjev spremljen. " +
            "Prije ponovnog slanja provjerite sa slastičarkom " +
            "kako se narudžba ne bi ponovila.";
    } finally {
        kontrole.forEach((kontrola, indeks) => {
            kontrola.disabled = prethodnaStanja[indeks];
        });

        slanjeUTijeku = false;
        gumbPosalji.textContent = "Pošalji zahtjev za narudžbu";
    }
});

formaNarudzbe.addEventListener("input", () => {
    if (!slanjeUTijeku) {
        porukaNarudzbe.textContent = "";
    }
});