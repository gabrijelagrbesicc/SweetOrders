const forma = document.getElementById("proizvod-forma");
const poruka = document.getElementById("proizvod-poruka");
const gumb = document.getElementById("spremi-proizvod");
const slasticarka = document.getElementById("slasticarka");
const jedinica = document.getElementById("jedinica");
const minimum = document.getElementById("minimum");

function postaviKorak() {
    const kilogrami = jedinica.value === "kg";

    minimum.min = kilogrami ? "0.5" : "1";
    minimum.step = kilogrami ? "0.5" : "1";
    minimum.value = "1";
}

jedinica.addEventListener("change", postaviKorak);

async function ucitajSlasticarke() {
    try {
        const odgovor = await fetch("/api/admin/slasticarke");

        if (odgovor.status === 401) {
            window.location.replace("/prijava.html");
            return;
        }

        if (!odgovor.ok) {
            throw new Error("Učitavanje slastičarki nije uspjelo.");
        }

        const podaci = await odgovor.json();
        slasticarka.replaceChildren();

        for (const vlasnica of podaci) {
            const opcija = document.createElement("option");
            opcija.value = vlasnica.ID;
            opcija.textContent = vlasnica.NAZIV;
            slasticarka.appendChild(opcija);
        }

        if (podaci.length === 0) {
            poruka.textContent = "Prvo treba dodati aktivnu slastičarku.";
            return;
        }

        gumb.disabled = false;
    } catch (greska) {
        poruka.textContent = greska.message;
    }
}

forma.addEventListener("submit", async (dogadaj) => {
    dogadaj.preventDefault();

    if (gumb.disabled || !forma.reportValidity()) return;

    const podaci = {
        slasticarkaId: Number(slasticarka.value),
        naziv: document.getElementById("naziv").value.trim(),
        opis: document.getElementById("opis").value.trim(),
        kategorija: document.getElementById("kategorija").value,
        cijena: Number(document.getElementById("cijena").value),
        jedinica: jedinica.value,
        minimalnaKolicina: Number(minimum.value)
    };

    const kontrole = Array.from(forma.elements);
    kontrole.forEach((element) => element.disabled = true);
    poruka.textContent = "Spremanje proizvoda...";

    try {
        const odgovor = await fetch("/api/admin/proizvodi", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify(podaci)
        });

        const rezultat = await odgovor.json();

        if (!odgovor.ok) {
            poruka.textContent = rezultat.poruka || "Spremanje nije uspjelo.";
            return;
        }

        forma.reset();
        slasticarka.value = String(podaci.slasticarkaId);
        postaviKorak();
        poruka.textContent = rezultat.poruka;
        await ucitajProizvode();
    } catch (greska) {
        console.error(greska);
        poruka.textContent =
            "Nije moguće potvrditi spremanje. Prije ponovnog slanja " +
            "provjerite ponudu kako ne biste dodali isti proizvod dvaput.";
    } finally {
        kontrole.forEach((element) => element.disabled = false);
    }
});

ucitajSlasticarke();

const popisProizvoda = document.getElementById("popis-proizvoda");
const popisPoruka = document.getElementById("popis-poruka");
const osvjeziProizvode = document.getElementById("osvjezi-proizvode");

async function ucitajProizvode() {
    osvjeziProizvode.disabled = true;
    popisPoruka.textContent = "Učitavanje proizvoda...";
    popisProizvoda.replaceChildren();

    try {
        const odgovor = await fetch("/api/admin/proizvodi");

        if (odgovor.status === 401) {
            window.location.replace("/prijava.html");
            return;
        }

        if (!odgovor.ok) {
            throw new Error("Proizvode nije moguće učitati.");
        }

        const proizvodi = await odgovor.json();

        popisPoruka.textContent = proizvodi.length
            ? "Broj proizvoda: " + proizvodi.length
            : "Još nema proizvoda.";

        for (const proizvod of proizvodi) {
            const kartica = document.createElement("article");
            kartica.className = "kartica";

            const status = document.createElement("span");
            status.className = "status";
            status.textContent = proizvod.DOSTUPAN === 1
                ? "Vidljiv kupcima"
                : "Skriven";

            const naslov = document.createElement("h3");
            naslov.textContent = proizvod.NAZIV;

            const vlasnica = document.createElement("p");
            vlasnica.textContent = proizvod.SLASTICARKA;

            const cijena = document.createElement("p");
            cijena.textContent =
                Number(proizvod.CIJENA).toLocaleString("hr-HR", {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2
                }) + " KM / " + proizvod.JEDINICA;

            const promijeni = document.createElement("button");
            promijeni.type = "button";
            promijeni.textContent = proizvod.DOSTUPAN === 1
                ? "Sakrij iz ponude"
                : "Vrati u ponudu";

            const obavijest = document.createElement("p");
            obavijest.setAttribute("role", "status");

            promijeni.addEventListener("click", async () => {
                promijeni.disabled = true;
                obavijest.textContent = "Spremanje...";

                try {
                    const odgovor = await fetch(
                        `/api/admin/proizvodi/${proizvod.ID}/dostupnost`,
                        {
                            method: "PATCH",
                            headers: {
                                "Content-Type": "application/json"
                            },
                            body: JSON.stringify({
                                dostupan: proizvod.DOSTUPAN === 1 ? 0 : 1
                            })
                        }
                    );

                    const rezultat = await odgovor.json();

                    if (!odgovor.ok) {
                        obavijest.textContent =
                            rezultat.poruka || "Promjena nije uspjela.";
                        return;
                    }

                    await ucitajProizvode();
                } catch (greska) {
                    console.error(greska);
                    obavijest.textContent =
                        "Nije moguće potvrditi promjenu. Kliknite Osvježi.";
                } finally {
                    promijeni.disabled = false;
                }
            });

            kartica.append(
                status, naslov, vlasnica, cijena, promijeni, obavijest
            );
            const uredi = document.createElement("button");
uredi.type = "button";
uredi.textContent = "Uredi proizvod";

uredi.addEventListener("click", () => {
    otvoriUredivanje(proizvod);
});

const akcijeUredivanja = document.createElement("div");
akcijeUredivanja.className = "akcije-narudzbe";
akcijeUredivanja.appendChild(uredi);

kartica.appendChild(akcijeUredivanja);
            popisProizvoda.appendChild(kartica);
        }
    } catch (greska) {
        popisPoruka.textContent = greska.message;
    } finally {
        osvjeziProizvode.disabled = false;
    }
}

osvjeziProizvode.addEventListener("click", ucitajProizvode);

ucitajProizvode();

const odjeljakUredivanje = document.getElementById("uredivanje");
const formaUredi = document.getElementById("uredi-forma");
const porukaUredi = document.getElementById("uredi-poruka");

let proizvodZaUredivanje = null;
let spremanjeIzmjena = false;

function otvoriUredivanje(proizvod) {
    if (spremanjeIzmjena) return;

    proizvodZaUredivanje = proizvod.ID;

    document.getElementById("uredi-naziv").value = proizvod.NAZIV;
    document.getElementById("uredi-opis").value = proizvod.OPIS || "";
    document.getElementById("uredi-cijenu").value = proizvod.CIJENA;
    document.getElementById("uredi-sliku").value =
    proizvod.SLIKA_URL || "";

    document.getElementById("uredi-jedinica").textContent =
        proizvod.SLASTICARKA +
        " — cijena po jedinici: " + proizvod.JEDINICA;

    porukaUredi.textContent = "";
    odjeljakUredivanje.hidden = false;

    odjeljakUredivanje.scrollIntoView({
        behavior: "smooth",
        block: "start"
    });

    document.getElementById("uredi-naziv").focus({
        preventScroll: true
    });
}

document.getElementById("odustani-uredivanje")
    .addEventListener("click", () => {
        if (spremanjeIzmjena) return;

        odjeljakUredivanje.hidden = true;
        proizvodZaUredivanje = null;
        formaUredi.reset();
    });

formaUredi.addEventListener("submit", async (dogadaj) => {
    dogadaj.preventDefault();

    if (
        spremanjeIzmjena ||
        proizvodZaUredivanje === null ||
        !formaUredi.reportValidity()
    ) {
        return;
    }

    const id = proizvodZaUredivanje;

    const podaci = {
    naziv: document.getElementById("uredi-naziv").value.trim(),
    opis: document.getElementById("uredi-opis").value.trim(),
    cijena: Number(document.getElementById("uredi-cijenu").value),
    slikaUrl: document.getElementById("uredi-sliku").value.trim()
};

    spremanjeIzmjena = true;

    const kontrole = Array.from(formaUredi.elements);
    kontrole.forEach((element) => element.disabled = true);

    porukaUredi.textContent = "Spremanje izmjena...";

    try {
        const odgovor = await fetch(`/api/admin/proizvodi/${id}`, {
            method: "PATCH",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify(podaci)
        });

        const rezultat = await odgovor.json();

        if (!odgovor.ok) {
            porukaUredi.textContent =
                rezultat.poruka || "Izmjene nisu spremljene.";
            return;
        }

        await ucitajProizvode();

        porukaUredi.textContent = "Izmjene su spremljene.";
    } catch (greska) {
        console.error(greska);
        porukaUredi.textContent =
            "Nije moguće potvrditi spremanje. Osvježite popis " +
            "i provjerite proizvod prije ponovnog uređivanja.";
    } finally {
        spremanjeIzmjena = false;
        kontrole.forEach((element) => element.disabled = false);
    }
});

