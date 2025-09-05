/**
 * app.js
 * Shared logic for multi-page demo (front-end only).
 * Uses localStorage + BroadcastChannel to coordinate across tabs.
 *
 * NOTE: This demo is intentionally front-end only. For real multi-user:
 *  - implement server + WebSocket
 *  - secure auth & storage on server side
 */

const GG = (function(){
  const BC = new BroadcastChannel('gg_channel_v2');
  const KEYS = {
    SETTINGS: 'gg_settings_v2',
    PLAYERS: 'gg_players_v2',
    LEADER: 'gg_leaderboard_v2',
    GAME: 'gg_game_v2'
  };

  // default state
  function defaults(){
    return {
      settings: { gameKey:'', maxPlayers:5, chancesPerPlayer:5 },
      players: [], // {id,name,chancesLeft,secret,joinedAt}
      leaderboard: {}, // name: {wins, totalAttempts}
      game: { started:false, stoppedBy:'', admin:'admin' }
    };
  }

  // storage helpers
  function read(k){ try{ return JSON.parse(localStorage.getItem(k) || 'null'); }catch(e){return null;} }
  function write(k,v){ localStorage.setItem(k, JSON.stringify(v)); BC.postMessage({type:'sync'}); }

  function getSettings(){
    const s = read(KEYS.SETTINGS); return s ? s : defaults().settings;
  }
  function saveSettings(s){ write(KEYS.SETTINGS, s); }

  function getPlayers(){ return read(KEYS.PLAYERS) || []; }
  function savePlayers(pl){ write(KEYS.PLAYERS, pl); }

  function getLeaderboard(){ return read(KEYS.LEADER) || {}; }
  function saveLeaderboard(lb){ write(KEYS.LEADER, lb); }

  function getGame(){ return read(KEYS.GAME) || defaults().game; }
  function saveGame(g){ write(KEYS.GAME, g); }

  // initial seed if missing
  if(!read(KEYS.SETTINGS)) saveSettings(defaults().settings);
  if(!read(KEYS.PLAYERS)) savePlayers([]);
  if(!read(KEYS.LEADER)) saveLeaderboard({});
  if(!read(KEYS.GAME)) saveGame(defaults().game);

  // util
  function uid(){ return Date.now().toString(36) + Math.random().toString(36).slice(2,6); }
  function rndKey(){ return Math.random().toString(36).slice(2,9).toUpperCase(); }
  function rndNumber(){ return Math.floor(Math.random()*100)+1; }

  // public API
  const API = {
    getSettings: ()=> getSettings(),
    updateSettings: (upd)=> {
      const s = getSettings();
      Object.assign(s, upd);
      saveSettings(s);
      BC.postMessage({type:'settings_updated'});
    },
    generateKey: ()=>{
      const s = getSettings(); s.gameKey = rndKey(); saveSettings(s);
      BC.postMessage({type:'key_generated', key:s.gameKey});
      return s.gameKey;
    },

    getPlayers: ()=> getPlayers(),
    addPlayer: ({name})=>{
      const players = getPlayers();
      const s = getSettings();
      const p = { id: uid(), name, chancesLeft: s.chancesPerPlayer, secret: rndNumber(), joinedAt: Date.now() };
      players.push(p); savePlayers(players);
      BC.postMessage({type:'player_joined', player:p});
      return p;
    },
    removePlayer: (id)=>{
      let players = getPlayers();
      players = players.filter(p=>p.id!==id);
      savePlayers(players);
      BC.postMessage({type:'player_removed', id});
    },

    // Admin controls
    startGame: ()=>{
      const s = getSettings();
      let players = getPlayers();
      // initialize per-player secret + chances
      players = players.map(p=> ({...p, secret: rndNumber(), chancesLeft: s.chancesPerPlayer}) );
      savePlayers(players);
      const g = getGame(); g.started = true; g.stoppedBy = ''; saveGame(g);
      BC.postMessage({type:'game_started'});
    },

    stopGame: ()=>{
      const g = getGame(); g.started = false; saveGame(g);
      BC.postMessage({type:'game_stopped'});
    },

    // player guess handling
    playerGuess: (id, guess)=>{
      let players = getPlayers();
      const s = getSettings();
      const gState = getGame();
      const pIdx = players.findIndex(x=>x.id===id);
      if(pIdx === -1) return {ok:false, message:'Player not found'};
      if(!gState.started) return {ok:false, message:'Game not started by admin'};
      const player = players[pIdx];
      if(player.chancesLeft <= 0) {
        // personal restart before guessing
        player.secret = rndNumber(); player.chancesLeft = s.chancesPerPlayer;
        players[pIdx] = player; savePlayers(players);
        BC.postMessage({type:'player_restarted', id});
        return {ok:false, message:'You had no chances — your personal game restarted', event:`${player.name} personal game restarted`};
      }

      player.chancesLeft -= 1;
      let message = '';
      if(guess === player.secret){
        // player wins: update leaderboard, stop full game
        const lb = getLeaderboard();
        lb[player.name] = lb[player.name] || {wins:0, totalAttempts:0};
        lb[player.name].wins += 1;
        const attemptsUsed = s.chancesPerPlayer - player.chancesLeft;
        lb[player.name].totalAttempts = (lb[player.name].totalAttempts || 0) + attemptsUsed;
        saveLeaderboard(lb);

        // stop entire game
        const g = getGame(); g.started = false; g.stoppedBy = player.name; saveGame(g);

        savePlayers(players); // updated chances etc
        BC.postMessage({type:'player_won', name:player.name});
        message = `Correct! ${player.name} wins!`;
        return {ok:true, message, event:`${player.name} won the game`};
      } else {
        message = guess < player.secret ? 'The hidden number is greater.' : 'The hidden number is smaller.';
        // if ran out of personal chances, restart their game individually
        if(player.chancesLeft <= 0){
          // restart this player's personal game
          player.secret = rndNumber();
          player.chancesLeft = s.chancesPerPlayer;
          players[pIdx] = player;
          savePlayers(players);
          BC.postMessage({type:'player_personal_restart', id:player.id, name:player.name});
          return {ok:false, message: message + ' You ran out of chances — your personal game restarted.', event:`${player.name} ran out of chances and restarted`};
        } else {
          players[pIdx] = player;
          savePlayers(players);
          BC.postMessage({type:'player_guess', id:player.id, guess, feedback: message});
          return {ok:false, message: message, event:`${player.name} guessed ${guess} — ${message}`};
        }
      }
    },

    getLeaderboard: ()=> getLeaderboard(),
    resetLeaderboard: ()=> { saveLeaderboard({}); BC.postMessage({type:'leader_reset'}); },

    clearLobby: ()=> { savePlayers([]); BC.postMessage({type:'lobby_cleared'}); },

    isGameRunning: ()=> getGame().started,

    // admin can get notified
    notifyAdmin: (type, payload)=> BC.postMessage({type:'admin_notify', sub:type, payload}),

    // events
    onSync: (cb)=> {
      BC.onmessage = (ev)=>{
        if(ev.data && cb) cb(ev.data);
      };
      // also call cb on storage events from other tabs
      window.addEventListener('storage', (e)=>{
        if(cb) cb({type:'storage_event', key:e.key});
      });
    },

    // internal helper to expose for pages
    _readAll: ()=> ({ settings:getSettings(), players:getPlayers(), leaderboard:getLeaderboard(), game:getGame() })
  };

  // broadcast handler: when any tab requests sync, respond by writing current values (which triggers others)
  BC.onmessage = (ev)=>{
    // noop here; pages use onSync to listen
  };

  return API;
})();
window.GG = GG;