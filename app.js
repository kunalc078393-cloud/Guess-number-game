async function adminLogin() {
  const username = document.getElementById("username").value;
  const password = document.getElementById("password").value;

  const res = await fetch("/admin/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password })
  });

  const data = await res.json();
  if (data.success) {
    document.getElementById("loginSection").style.display = "none";
    document.getElementById("adminPanel").style.display = "block";
  } else {
    document.getElementById("loginMsg").innerText = data.message;
  }
}

async function generateKey() {
  const maxPlayers = document.getElementById("maxPlayers").value;
  const chances = document.getElementById("chances").value;

  const res = await fetch("/admin/generateKey", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ maxPlayers, chancesPerPlayer: chances })
  });

  const data = await res.json();
  if (data.success) {
    document.getElementById("gameKey").innerText = `Game Key: ${data.key}`;
    const qr = document.getElementById("qrCode");
    qr.src = data.qr;
    qr.style.display = "block";
  }
}
