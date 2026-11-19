
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

// FILTRIRANJE NARUDZBI
const statusiZaFilter = [
    ["sve", "Sve"],
    ["ceka potvrdu", "Čeka potvrdu"],
    ["dogovoreno", "Dogovoreno"],
    ["u izradi", "U izradi"],
    ["spremno", "Spremno"],
    ["preuzeto", "Preuzeto"],
    ["otkazano", "Otkazano"]
];

let sveNarudzbe = [];
let odabraniStatus = "sve";
const gumbiFiltera = new Map();

const filteri = document.createElement("div");
filteri.className = "filteri-narudzbi";
filteri.setAttribute("role", "group");
filteri.setAttribute(
    "aria-label",
    "Filtriraj narudžbe prema statusu"
);

Object.assign(filteri.style, {
    display: "flex",
    flexWrap: "wrap",
    gap: "8px",
    margin: "14px 0 20px"
});

for (const [vrijednost, naziv] of statusiZaFilter) {
    const gumb = document.createElement("button");
    gumb.type = "button";
    gumb.textContent = naziv;
    gumb.setAttribute("aria-pressed", "false");

    Object.assign(gumb.style, {
        borderRadius: "20px",
        padding: "8px 12px",
        cursor: "pointer"
    });

    gumb.addEventListener("click", () => {
        odabraniStatus = vrijednost;
        osvjeziFiltere();
        prikaziNarudzbe();
    });

    gumbiFiltera.set(vrijednost, gumb);
    filteri.appendChild(gumb);
}

poruka.insertAdjacentElement("afterend", filteri);

// PRETRAZIVANJE NARUDZBI
const pretraga = document.createElement("input");

pretraga.type = "search";
pretraga.placeholder = "Pretraži po imenu kupca ili broju narudžbe";
pretraga.setAttribute("aria-label", "Pretraživanje narudžbi");

pretraga.style.width = "100%";
pretraga.style.maxWidth = "450px";
pretraga.style.padding = "12px";
pretraga.style.borderRadius = "10px";
pretraga.style.border = "1px solid #ccc";
pretraga.style.marginBottom = "20px";

filteri.insertAdjacentElement("afterend", pretraga);
pretraga.addEventListener("input", prikaziNarudzbe);

// SORTIRANJE NARUDZBI
const sortiranje = document.createElement("select");

sortiranje.setAttribute(
    "aria-label",
    "Sortiranje narudžbi"
);

sortiranje.innerHTML = `
    <option value="najblize">Najbliži datum preuzimanja</option>
    <option value="najdalje">Najdalji datum preuzimanja</option>
    <option value="nove">Najnovije narudžbe</option>
    <option value="stare">Najstarije narudžbe</option>
`;

sortiranje.style.padding = "12px";
sortiranje.style.borderRadius = "10px";
sortiranje.style.marginBottom = "20px";

pretraga.insertAdjacentElement("afterend", sortiranje);
sortiranje.addEventListener("change", prikaziNarudzbe);

// OSVJEZAVANJE FILTERA
function osvjeziFiltere() {
    for (const [vrijednost, naziv] of statusiZaFilter) {
        const gumb = gumbiFiltera.get(vrijednost);
        const aktivan = odabraniStatus === vrijednost;

        const broj = vrijednost === "sve"
            ? sveNarudzbe.length
            : sveNarudzbe.filter(
                (n) => n.STATUS === vrijednost
            ).length;

        gumb.textContent = `${naziv} (${broj})`;
        gumb.setAttribute("aria-pressed", String(aktivan));

        gumb.style.backgroundColor =
            aktivan ? "#274f3b" : "#ffffff";

        gumb.style.color =
            aktivan ? "#ffffff" : "#274f3b";

        gumb.style.border = "1px solid #274f3b";
    }
}

// POMOCNE FUNKCIJE
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
    red.append(
        oznaka,
        document.createTextNode(String(vrijednost))
    );

    red.className = klasa;
    kartica.appendChild(red);
}

// PROMJENA STATUSA
async function promijeniStatus(id, status, akcije, obavijest) {
    const pitanja = {
        "dogovoreno": "Želite li prihvatiti narudžbu i traženi termin?",
        "otkazano": "Želite li odbiti ovu narudžbu?",
        "u izradi": "Želite li označiti da je priprema započela?",
        "spremno": "Je li narudžba spremna za preuzimanje?",
        "preuzeto": "Je li kupac preuzeo narudžbu?"
    };

    if (!window.confirm(pitanja[status])) {
        return;
    }

    const gumbi = akcije.querySelectorAll("button");

    gumbi.forEach((gumb) => {
        gumb.disabled = true;
    });

    obavijest.textContent = "Spremanje...";

    try {
        const odgovor = await fetch(
            `/api/narudzbe/${id}/status`,
            {
                method: "PATCH",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({ status })
            }
        );

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

// PRIKAZ NARUDZBI PREMA ODABRANOM FILTRU
function prikaziNarudzbe() {
    prikazNarudzbi.replaceChildren();

    const upit = pretraga.value.trim().toLocaleLowerCase("hr-HR");

    const narudzbe = sveNarudzbe.filter((narudzba) => {
        const odgovaraStatusu =
            odabraniStatus === "sve" ||
            narudzba.STATUS === odabraniStatus;

        const odgovaraPretrazi =
            upit === "" ||
            String(narudzba.ID).includes(upit) ||
            String(narudzba.IME_KUPCA || "")
                .toLocaleLowerCase("hr-HR")
                .includes(upit);

        return odgovaraStatusu && odgovaraPretrazi;
    });

    // SORTIRANJE REZULTATA
    narudzbe.sort((a, b) => {
        const datumA = new Date(a.DATUM_PREUZIMANJA).getTime();
        const datumB = new Date(b.DATUM_PREUZIMANJA).getTime();

        // Ako postoji datum stvaranja, koristi ga; inace koristi ID narudzbe.
        // Kod automatski rastucih ID-eva veci ID odgovara novijoj narudzbi.
        const kreiranoA = Date.parse(a.KREIRANO_AT || "");
        const kreiranoB = Date.parse(b.KREIRANO_AT || "");

        const usporediKreiranje =
            Number.isFinite(kreiranoA) && Number.isFinite(kreiranoB)
                ? kreiranoA - kreiranoB
                : Number(a.ID) - Number(b.ID);

        switch (sortiranje.value) {
            case "najblize":
                return datumA - datumB;

            case "najdalje":
                return datumB - datumA;

            case "nove":
                return -usporediKreiranje;

            case "stare":
                return usporediKreiranje;

            default:
                return 0;
        }
    });

    if (sveNarudzbe.length === 0) {
        poruka.textContent = "Još nema narudžbi.";
    } else if (narudzbe.length === 0) {
        poruka.textContent =
            "Nema narudžbi s odabranim statusom.";
    } else {
        poruka.textContent =
            `Prikazano narudžbi: ${narudzbe.length} od ${sveNarudzbe.length}`;
    }

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
        dodajRed(
            kartica,
            "Napomena",
            narudzba.OPIS || "—"
        );

        const podnaslov = document.createElement("h4");
        podnaslov.textContent = "Naručeni proizvodi";
        kartica.appendChild(podnaslov);

        if (
            narudzba.STAVKE &&
            narudzba.STAVKE.length > 0
        ) {
            const lista = document.createElement("ul");
            lista.className = "popis-stavki";

            for (const stavka of narudzba.STAVKE) {
                const red = document.createElement("li");

                const iznos = Math.round(
                    stavka.KOLICINA *
                    stavka.JEDINICNA_CIJENA * 100
                ) / 100;

                red.textContent =
                    stavka.NAZIV_PROIZVODA + " — " +
                    Number(stavka.KOLICINA).toLocaleString("hr-HR") +
                    " " + stavka.JEDINICA +
                    " × " + formatirajNovac(
                        stavka.JEDINICNA_CIJENA
                    ) +
                    " = " + formatirajNovac(iznos);

                lista.appendChild(red);
            }

            kartica.appendChild(lista);
        } else {
            dodajRed(
                kartica,
                "Proizvod",
                narudzba.PROIZVOD
            );
        }

        // PLACANJE
        dodajRed(
            kartica,
            "Ukupno",
            formatirajNovac(narudzba.CIJENA)
        );

        dodajRed(
            kartica,
            "Uplaćeno",
            formatirajNovac(narudzba.PLACENO)
        );

        dodajRed(
            kartica,
            "Preostalo za platiti",
            formatirajNovac(
                narudzba.CIJENA - narudzba.PLACENO
            ),
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

        // PRIHVATI I ODBIJ
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
                    narudzba.ID,
                    "dogovoreno",
                    akcije,
                    obavijest
                );
            });

            odbij.addEventListener("click", () => {
                promijeniStatus(
                    narudzba.ID,
                    "otkazano",
                    akcije,
                    obavijest
                );
            });

            akcije.append(prihvati, odbij);
            kartica.append(akcije, obavijest);
        }

        // SLJEDECE FAZE NARUDZBE
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

        const sljedeciKorak =
            sljedeciKoraci[narudzba.STATUS];

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

        // EVIDENTIRANJE UPLATE
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
            const akcijePlacanja =
                document.createElement("div");

            akcijePlacanja.className = "akcije-narudzbe";

            const plati = document.createElement("button");
            plati.type = "button";
            plati.textContent = "Označi kao plaćeno";

            const porukaPlacanja =
                document.createElement("p");

            porukaPlacanja.setAttribute("role", "status");

            plati.addEventListener("click", async () => {
                const preostalo = formatirajNovac(
                    narudzba.CIJENA - narudzba.PLACENO
                );

                if (!window.confirm(
                    "Potvrđujete li da ste primili preostalih " +
                    preostalo +
                    " i da je račun potpuno plaćen?"
                )) {
                    return;
                }

                plati.disabled = true;
                porukaPlacanja.textContent =
                    "Spremanje uplate...";

                try {
                    const odgovor = await fetch(
                        `/api/narudzbe/${narudzba.ID}/placanje`,
                        { method: "PATCH" }
                    );

                    const rezultat = await odgovor.json();

                    if (!odgovor.ok) {
                        porukaPlacanja.textContent =
                            rezultat.poruka ||
                            "Spremanje nije uspjelo.";
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
            kartica.append(
                akcijePlacanja,
                porukaPlacanja
            );
        }

        prikazNarudzbi.appendChild(kartica);
    }
}

// UCITAVANJE NARUDZBI S SERVERA
async function ucitajNarudzbe() {
    poruka.textContent = "Učitavanje narudžbi...";
    gumbOsvjezi.disabled = true;

    try {
        const odgovor = await fetch("/api/narudzbe");

        if (!odgovor.ok) {
            throw new Error(
                "Dohvat narudžbi nije uspio."
            );
        }

        const narudzbe = await odgovor.json();

        if (!Array.isArray(narudzbe)) {
            throw new Error(
                "Neočekivan odgovor servera."
            );
        }

        sveNarudzbe = narudzbe;

        osvjeziFiltere();
        prikaziNarudzbe();
    } catch (greska) {
        poruka.textContent =
            "Narudžbe se nisu učitale. " +
            "Provjerite server i kliknite Osvježi.";

        console.error(greska);
    } finally {
        gumbOsvjezi.disabled = false;
    }
}

// OSVJEZAVANJE
gumbOsvjezi.addEventListener(
    "click",
    ucitajNarudzbe
);

ucitajNarudzbe();

// ODJAVA
document.getElementById("odjava").addEventListener(
    "click",
    async () => {
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
            poruka.textContent =
                "Odjava nije uspjela. Pokušajte ponovno.";

            gumb.disabled = false;
        }
    }
);
