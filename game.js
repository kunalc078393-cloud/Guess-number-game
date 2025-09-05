const socket = io();
let playerName = "";

async function joinGame() {
  playerName = document.getElementById("playerName").value;
  const key = document.getElementById("gameKey").value;

  const res = await fetch("/join", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ key, playerName })
  });

  const data = await res.json();
  if (data.success) {
    document.getElementById("joinSection").style.display = "none";
    document.getElementById("gameSection").style.display = "block";
  } else {
    document.getElementById("joinMsg").innerText = data.message;
  }
}

function makeGuess() {
  const guess = document.getElementById("guess").value;
  socket.emit("guess", { playerName, guess });
}

socket.on("result", (data) => {
  document.getElementById("result").innerText = data.message;
});

socket.on("gameOver", (data) => {
  alert(`🎉 ${data.winner} won the game! The number was ${data.number}`);
  location.reload();
});
