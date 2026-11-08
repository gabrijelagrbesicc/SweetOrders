const prikazNarudzbi = document.getElementById("narudzbe");
const poruka = document.getElementById("poruka");
const gumbOsvjezi = document.getElementById("osvjezi");

const naziviStatusa = {
    "ceka potvrdu": "Čeka potvrdu",
    "dogovoreno": "Dogovoreno",
    "u izradi": "U izradi",
    "spremno": "Spremno",
    "preuzeto": "Preuzeto",
    "otkazano": "Otkazano"
};

function formatirajNovac(iznos) {
    return Number(iznos).toLocaleString("hr-HR", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    }) + " KM";
}

function dodajRed(kartica, naziv, vrijednost, klasa = "") {
    const red = document.createElement("p");
    const oznaka = document.createElement("strong");

    oznaka.textContent = naziv + ": ";
    red.append(oznaka, document.createTextNode(String(vrijednost)));
    red.className = klasa;

    kartica.appendChild(red);
}

async function promijeniStatus(id, status, akcije, obavijest) {
    const pitanja = {
    "dogovoreno": "Želite li prihvatiti narudžbu i traženi termin?",
    "otkazano": "Želite li odbiti ovu narudžbu?",
    "u izradi": "Želite li označiti da je priprema započela?",
    "spremno": "Je li narudžba spremna za preuzimanje?",
    "preuzeto": "Je li kupac preuzeo narudžbu?"
};

const pitanje = pitanja[status];

    if (!window.confirm(pitanje)) {
        return;
    }

    const gumbi = akcije.querySelectorAll("button");

    gumbi.forEach((gumb) => {
        gumb.disabled = true;
    });

    obavijest.textContent = "Spremanje...";

    try {
        const odgovor = await fetch(`/api/narudzbe/${id}/status`, {
            method: "PATCH",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ status })
        });

        const rezultat = await odgovor.json();

        if (!odgovor.ok) {
            obavijest.textContent =
                rezultat.poruka || "Promjena nije uspjela.";
            return;
        }

        await ucitajNarudzbe();
    } catch (greska) {
        console.error(greska);

        obavijest.textContent =
            "Nije moguće potvrditi promjenu. Kliknite Osvježi " +
            "da provjerite trenutačni status.";
    } finally {
        gumbi.forEach((gumb) => {
            gumb.disabled = false;
        });
    }
}

async function ucitajNarudzbe() {
    poruka.textContent = "Učitavanje narudžbi...";
    gumbOsvjezi.disabled = true;
    prikazNarudzbi.replaceChildren();

    try {
        const odgovor = await fetch("/api/narudzbe");

        if (!odgovor.ok) {
            throw new Error("Dohvat narudžbi nije uspio.");
        }

        const narudzbe = await odgovor.json();

        if (!Array.isArray(narudzbe)) {
            throw new Error("Neočekivan odgovor servera.");
        }

        poruka.textContent = narudzbe.length === 0
            ? "Još nema narudžbi."
            : `Broj narudžbi: ${narudzbe.length}`;

        for (const narudzba of narudzbe) {
            const kartica = document.createElement("article");
            kartica.className = "kartica";

            const status = document.createElement("span");
            status.className = "status";
            status.textContent =
                naziviStatusa[narudzba.STATUS] || narudzba.STATUS;

            const naslov = document.createElement("h3");
            naslov.textContent = "Narudžba #" + narudzba.ID;

            kartica.append(status, naslov);

            const datum = new Date(
                narudzba.DATUM_PREUZIMANJA
            ).toLocaleString("hr-HR", {
                timeZone: "Europe/Sarajevo",
                day: "2-digit",
                month: "2-digit",
                year: "numeric",
                hour: "2-digit",
                minute: "2-digit"
            });

            dodajRed(kartica, "Kupac", narudzba.IME_KUPCA);
            dodajRed(kartica, "Telefon", narudzba.TELEFON);
            dodajRed(kartica, "Preuzimanje", datum);
            dodajRed(kartica, "Napomena", narudzba.OPIS || "—");

            const podnaslov = document.createElement("h4");
            podnaslov.textContent = "Naručeni proizvodi";
            kartica.appendChild(podnaslov);

            if (narudzba.STAVKE && narudzba.STAVKE.length > 0) {
                const lista = document.createElement("ul");
                lista.className = "popis-stavki";

                for (const stavka of narudzba.STAVKE) {
                    const red = document.createElement("li");

                    const iznos = Math.round(
                        stavka.KOLICINA * stavka.JEDINICNA_CIJENA * 100
                    ) / 100;

                    red.textContent =
                        stavka.NAZIV_PROIZVODA + " — " +
                        Number(stavka.KOLICINA).toLocaleString("hr-HR") +
                        " " + stavka.JEDINICA +
                        " × " + formatirajNovac(stavka.JEDINICNA_CIJENA) +
                        " = " + formatirajNovac(iznos);

                    lista.appendChild(red);
                }

                kartica.appendChild(lista);
            } else {
                // Stara probna narudžba nema zasebne stavke.
                dodajRed(kartica, "Proizvod", narudzba.PROIZVOD);
            }

            dodajRed(kartica, "Ukupno", formatirajNovac(narudzba.CIJENA));
dodajRed(kartica, "Uplaćeno", formatirajNovac(narudzba.PLACENO));

dodajRed(
    kartica,
    "Preostalo za platiti",
    formatirajNovac(narudzba.CIJENA - narudzba.PLACENO),
    "ostatak"
);

dodajRed(
    kartica,
    "Naplata",
    narudzba.PLACENO >= narudzba.CIJENA
        ? "Plaćeno u cijelosti"
        : narudzba.PLACENO > 0
            ? "Djelomično plaćeno"
            : "Nije plaćeno"
);

            if (narudzba.STATUS === "ceka potvrdu") {
                const akcije = document.createElement("div");
                akcije.className = "akcije-narudzbe";

                const obavijest = document.createElement("p");
                obavijest.setAttribute("role", "status");

                const prihvati = document.createElement("button");
                prihvati.type = "button";
                prihvati.className = "gumb-prihvati";
                prihvati.textContent = "Prihvati";

                const odbij = document.createElement("button");
                odbij.type = "button";
                odbij.className = "gumb-odbij";
                odbij.textContent = "Odbij";

                prihvati.addEventListener("click", () => {
                    promijeniStatus(
                        narudzba.ID, "dogovoreno", akcije, obavijest
                    );
                });

                odbij.addEventListener("click", () => {
                    promijeniStatus(
                        narudzba.ID, "otkazano", akcije, obavijest
                    );
                });

                akcije.append(prihvati, odbij);
                kartica.append(akcije, obavijest);
            }
            const sljedeciKoraci = {
    "dogovoreno": {
        status: "u izradi",
        tekst: "Započni pripremu"
    },
    "u izradi": {
        status: "spremno",
        tekst: "Označi kao spremno"
    },
    "spremno": {
        status: "preuzeto",
        tekst: "Označi kao preuzeto"
    }
};

const sljedeciKorak = sljedeciKoraci[narudzba.STATUS];

if (sljedeciKorak) {
    const akcije = document.createElement("div");
    akcije.className = "akcije-narudzbe";

    const gumb = document.createElement("button");
    gumb.type = "button";
    gumb.className = "gumb-prihvati";
    gumb.textContent = sljedeciKorak.tekst;

    const obavijest = document.createElement("p");
    obavijest.setAttribute("role", "status");

    gumb.addEventListener("click", () => {
        promijeniStatus(
            narudzba.ID,
            sljedeciKorak.status,
            akcije,
            obavijest
        );
    });

    akcije.appendChild(gumb);
    kartica.append(akcije, obavijest);
}
            const mozeEvidentiratiUplatu = [
    "dogovoreno",
    "u izradi",
    "spremno",
    "preuzeto"
].includes(narudzba.STATUS);

if (
    mozeEvidentiratiUplatu &&
    narudzba.PLACENO < narudzba.CIJENA
) {
    const akcijePlacanja = document.createElement("div");
    akcijePlacanja.className = "akcije-narudzbe";

    const plati = document.createElement("button");
    plati.type = "button";
    plati.textContent = "Označi kao plaćeno";

    const porukaPlacanja = document.createElement("p");
    porukaPlacanja.setAttribute("role", "status");

    plati.addEventListener("click", async () => {
        const preostalo = formatirajNovac(
            narudzba.CIJENA - narudzba.PLACENO
        );

        if (!window.confirm(
            "Potvrđujete li da ste primili preostalih " +
            preostalo + " i da je račun potpuno plaćen?"
        )) {
            return;
        }

        plati.disabled = true;
        porukaPlacanja.textContent = "Spremanje uplate...";

        try {
            const odgovor = await fetch(
                `/api/narudzbe/${narudzba.ID}/placanje`,
                { method: "PATCH" }
            );

            const rezultat = await odgovor.json();

            if (!odgovor.ok) {
                porukaPlacanja.textContent =
                    rezultat.poruka || "Spremanje nije uspjelo.";
                return;
            }

            await ucitajNarudzbe();
        } catch (greska) {
            console.error(greska);

            porukaPlacanja.textContent =
                "Nije moguće potvrditi spremanje. " +
                "Kliknite Osvježi i provjerite iznos uplate.";
        } finally {
            plati.disabled = false;
        }
    });

    akcijePlacanja.appendChild(plati);
    kartica.append(akcijePlacanja, porukaPlacanja);
}
            prikazNarudzbi.appendChild(kartica);
        }
    } catch (greska) {
        poruka.textContent =
            "Narudžbe se nisu učitale. Provjerite server i kliknite Osvježi.";
        console.error(greska);
    } finally {
        gumbOsvjezi.disabled = false;
    }
}

gumbOsvjezi.addEventListener("click", ucitajNarudzbe);

ucitajNarudzbe();

document.getElementById("odjava").addEventListener("click", async () => {
    const gumb = document.getElementById("odjava");
    const poruka = document.getElementById("odjava-poruka");

    gumb.disabled = true;
    poruka.textContent = "";

    try {
        const odgovor = await fetch("/api/odjava", {
            method: "POST"
        });

        if (!odgovor.ok) {
            throw new Error("Odjava nije uspjela.");
        }

        window.location.replace("/prijava.html");
    } catch {
        poruka.textContent = "Odjava nije uspjela. Pokušajte ponovno.";
        gumb.disabled = false;
    }
});