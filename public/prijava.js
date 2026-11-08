const forma = document.getElementById("prijava-forma");
const poruka = document.getElementById("prijava-poruka");
const gumb = forma.querySelector("button");

forma.addEventListener("submit", async (dogadaj) => {
    dogadaj.preventDefault();

    if (gumb.disabled) return;

    gumb.disabled = true;
    poruka.textContent = "Prijava...";

    try {
        const odgovor = await fetch("/api/prijava", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                email: document.getElementById("email").value.trim(),
                lozinka: document.getElementById("lozinka").value
            })
        });

        const rezultat = await odgovor.json();

        if (!odgovor.ok) {
            poruka.textContent = rezultat.poruka;
            return;
        }

        window.location.replace("/index.html");
    } catch (greska) {
        console.error(greska);
        poruka.textContent = "Nije moguće povezivanje sa serverom.";
    } finally {
        gumb.disabled = false;
    }
});