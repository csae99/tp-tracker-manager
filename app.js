/**
 * Teen Patti Score & Chip Tracker
 * Professional Casino Table Engine & Game State Manager
 */

(function () {
  'use strict';

  // --- Audio Synthesizer (Zero External Dependencies) ---
  class SoundManager {
    constructor() {
      this.enabled = true;
      this.ctx = null;
    }

    init() {
      if (!this.ctx && (window.AudioContext || window.webkitAudioContext)) {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        this.ctx = new AudioCtx();
      }
    }

    playTone(freq, type = 'sine', duration = 0.15, gainVal = 0.1) {
      if (!this.enabled) return;
      this.init();
      if (!this.ctx) return;
      try {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(freq, this.ctx.currentTime);
        gain.gain.setValueAtTime(gainVal, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + duration);
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start();
        osc.stop(this.ctx.currentTime + duration);
      } catch (e) {
        console.warn('Audio play error:', e);
      }
    }

    playChipSound() {
      this.playTone(850, 'triangle', 0.08, 0.12);
      setTimeout(() => this.playTone(1150, 'triangle', 0.06, 0.08), 35);
    }

    playFoldSound() {
      this.playTone(280, 'sine', 0.2, 0.1);
    }

    playTurnBell() {
      this.playTone(520, 'sine', 0.25, 0.08);
    }

    playWinFanfare() {
      if (!this.enabled) return;
      const notes = [523.25, 659.25, 783.99, 1046.5];
      notes.forEach((freq, i) => {
        setTimeout(() => this.playTone(freq, 'triangle', 0.35, 0.18), i * 110);
      });
    }

    toggle() {
      this.enabled = !this.enabled;
      return this.enabled;
    }
  }

  const sound = new SoundManager();

  // --- Default Colors for Player Avatars ---
  const PLAYER_COLORS = [
    '#3b82f6', // Blue
    '#ef4444', // Red
    '#10b981', // Emerald
    '#f59e0b', // Amber
    '#8b5cf6', // Violet
    '#ec4899', // Pink
    '#06b6d4', // Cyan
    '#84cc16', // Lime
    '#f97316', // Orange
    '#14b8a6', // Teal
    '#6366f1', // Indigo
    '#d946ef', // Fuchsia
    '#e11d48', // Rose
    '#a855f7'  // Purple
  ];

  // --- Game State Model ---
  const state = {
    // Config
    config: {
      initialChips: 100,
      bootAmount: 5,
      maxRounds: 3,
      numPlayers: 4
    },

    // Session Data
    handNumber: 1,
    dealerIndex: 0,
    players: [],
    sessionHistory: [], // list of finished hands

    // Current Hand Active State
    isHandActive: false,
    pot: 0,
    currentBlindStake: 5, // B (Blind calls B, Seen calls 2B)
    roundNumber: 1,
    currentTurnIndex: 0,
    turnsInCurrentRound: 0,
    pendingRoundPlayerIds: [],
    actionHistory: [], // actions in the current hand

    // All-In State
    isAllInActive: false,
    allInInitiatorId: null,
    allInInitiatorName: null,
    allInTargetBet: 0,
    allInPendingPlayerIds: [],

    // Showdown Pending State (Max rounds reached or Showdown triggered)
    isShowdownPending: false,

    // Undo Stack
    undoStack: []
  };

  // --- LocalStorage Persistence Keys ---
  const STORAGE_KEY = 'TP_TRACKER_STATE_V1';

  function saveStateToStorage() {
    try {
      const serializable = {
        config: state.config,
        handNumber: state.handNumber,
        dealerIndex: state.dealerIndex,
        players: state.players,
        sessionHistory: state.sessionHistory,
        isHandActive: state.isHandActive,
        pot: state.pot,
        currentBlindStake: state.currentBlindStake,
        roundNumber: state.roundNumber,
        currentTurnIndex: state.currentTurnIndex,
        turnsInCurrentRound: state.turnsInCurrentRound,
        pendingRoundPlayerIds: state.pendingRoundPlayerIds || [],
        actionHistory: state.actionHistory,
        isAllInActive: state.isAllInActive,
        allInInitiatorId: state.allInInitiatorId,
        allInInitiatorName: state.allInInitiatorName,
        allInTargetBet: state.allInTargetBet,
        allInPendingPlayerIds: state.allInPendingPlayerIds,
        isShowdownPending: state.isShowdownPending,
        undoStack: (state.undoStack || []).slice(-30)
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(serializable));
    } catch (e) {
      console.error('Failed to save state to localStorage', e);
    }
  }

  function loadStateFromStorage() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (!saved) return false;
      const data = JSON.parse(saved);
      Object.assign(state.config, data.config || {});
      state.handNumber = data.handNumber || 1;
      state.dealerIndex = data.dealerIndex || 0;
      state.players = data.players || [];
      state.sessionHistory = data.sessionHistory || [];
      state.isHandActive = data.isHandActive || false;
      state.pot = data.pot || 0;
      state.currentBlindStake = data.currentBlindStake || state.config.bootAmount;
      state.roundNumber = data.roundNumber || 1;
      state.currentTurnIndex = data.currentTurnIndex || 0;
      state.turnsInCurrentRound = data.turnsInCurrentRound || 0;
      state.pendingRoundPlayerIds = Array.isArray(data.pendingRoundPlayerIds) ? data.pendingRoundPlayerIds : [];
      state.actionHistory = data.actionHistory || [];
      state.isAllInActive = data.isAllInActive || false;
      state.allInInitiatorId = data.allInInitiatorId || null;
      state.allInInitiatorName = data.allInInitiatorName || null;
      state.allInTargetBet = data.allInTargetBet || 0;
      state.allInPendingPlayerIds = data.allInPendingPlayerIds || [];
      state.isShowdownPending = data.isShowdownPending || false;
      state.undoStack = Array.isArray(data.undoStack) ? data.undoStack : [];
      return true;
    } catch (e) {
      console.warn('Could not restore state from storage', e);
      return false;
    }
  }

  // --- Snapshot Management for Undo ---
  function pushUndoSnapshot(actionDescription = '') {
    const snapshot = {
      description: actionDescription,
      handNumber: state.handNumber,
      dealerIndex: state.dealerIndex,
      isHandActive: state.isHandActive,
      pot: state.pot,
      currentBlindStake: state.currentBlindStake,
      roundNumber: state.roundNumber,
      currentTurnIndex: state.currentTurnIndex,
      turnsInCurrentRound: state.turnsInCurrentRound,
      pendingRoundPlayerIds: [...(state.pendingRoundPlayerIds || [])],
      isAllInActive: state.isAllInActive,
      allInInitiatorId: state.allInInitiatorId,
      allInInitiatorName: state.allInInitiatorName,
      allInTargetBet: state.allInTargetBet,
      allInPendingPlayerIds: [...(state.allInPendingPlayerIds || [])],
      isShowdownPending: state.isShowdownPending,
      players: JSON.parse(JSON.stringify(state.players)),
      actionHistory: JSON.parse(JSON.stringify(state.actionHistory))
    };
    state.undoStack.push(snapshot);
    // Limit undo history depth to 30 steps
    if (state.undoStack.length > 30) {
      state.undoStack.shift();
    }
    updateUndoButtonState();
    saveStateToStorage();
  }

  function findLastPlayerActionIndex() {
    if (!state.actionHistory || state.actionHistory.length === 0) return -1;
    for (let i = 0; i < state.actionHistory.length; i++) {
      const text = state.actionHistory[i].text;
      if (text.startsWith('--- Round') || text.startsWith('🏁') || text.startsWith('↺') || text.startsWith('🪙') || text.startsWith('⚠️')) {
        continue;
      }
      return i;
    }
    return -1;
  }

  function canRollbackLastAction() {
    return findLastPlayerActionIndex() !== -1;
  }

  function rollbackLastPlayerAction() {
    const actionIdx = findLastPlayerActionIndex();
    if (actionIdx === -1) return false;

    const actionText = state.actionHistory[actionIdx].text;
    let handled = false;
    let undonePlayerName = '';

    // 1. Blind or Chaal call (e.g. "Player 6 played Blind (-20 chips)")
    const callMatch = actionText.match(/^(.+?)\s+played\s+(Blind|Chaal)\s+\(-(\d+)\s+chips\)/i);
    if (callMatch) {
      const pName = callMatch[1].trim();
      undonePlayerName = pName;
      const actionType = callMatch[2];
      const amount = parseInt(callMatch[3], 10) || 0;
      const pIdx = state.players.findIndex(p => p.name === pName);
      if (pIdx !== -1) {
        const p = state.players[pIdx];
        p.chips += amount;
        p.currentHandBet = Math.max(0, (p.currentHandBet || 0) - amount);
        p.currentRoundBet = Math.max(0, (p.currentRoundBet || 0) - amount);
        state.pot = Math.max(0, state.pot - amount);
        if (actionType.toLowerCase() === 'blind') {
          p.isBlind = true;
        }
        state.isShowdownPending = false;
        state.currentTurnIndex = pIdx;
        const active = getActivePlayers();
        state.turnsInCurrentRound = Math.max(0, active.length - 1);
        handled = true;
      }
    }

    // 2. Packed / Folded (e.g. "Player 5 packed (Folded)")
    if (!handled) {
      const foldMatch = actionText.match(/^(.+?)\s+packed\s+\(Folded\)/i);
      if (foldMatch) {
        const pName = foldMatch[1].trim();
        undonePlayerName = pName;
        const pIdx = state.players.findIndex(p => p.name === pName);
        if (pIdx !== -1) {
          const p = state.players[pIdx];
          p.isFolded = false;
          state.isShowdownPending = false;
          state.currentTurnIndex = pIdx;
          const active = getActivePlayers();
          state.turnsInCurrentRound = Math.max(0, active.length - 1);
          handled = true;
        }
      }
    }

    // 3. Raised (e.g. "Player 2 RAISED to 20 chips! ...")
    if (!handled) {
      const raiseMatch = actionText.match(/^(.+?)\s+RAISED to\s+(\d+)\s+chips!/i);
      if (raiseMatch) {
        const pName = raiseMatch[1].trim();
        undonePlayerName = pName;
        const amount = parseInt(raiseMatch[2], 10) || 0;
        const pIdx = state.players.findIndex(p => p.name === pName);
        if (pIdx !== -1) {
          const p = state.players[pIdx];
          p.chips += amount;
          p.currentHandBet = Math.max(0, (p.currentHandBet || 0) - amount);
          p.currentRoundBet = Math.max(0, (p.currentRoundBet || 0) - amount);
          state.pot = Math.max(0, state.pot - amount);
          state.currentBlindStake = state.config.bootAmount;
          state.isShowdownPending = false;
          state.currentTurnIndex = pIdx;
          const active = getActivePlayers();
          state.turnsInCurrentRound = Math.max(0, active.length - 1);
          handled = true;
        }
      }
    }

    // 4. Called All-In (e.g. "⚡ Player 4 called ALL-IN (-45 chips ...)")
    if (!handled) {
      const callAllInMatch = actionText.match(/⚡\s*(.+?)\s+called ALL-IN\s+\(-(\d+)\s+chips/i);
      if (callAllInMatch) {
        const pName = callAllInMatch[1].trim();
        undonePlayerName = pName;
        const amount = parseInt(callAllInMatch[2], 10) || 0;
        const pIdx = state.players.findIndex(p => p.name === pName);
        if (pIdx !== -1) {
          const p = state.players[pIdx];
          p.chips += amount;
          p.currentHandBet = Math.max(0, (p.currentHandBet || 0) - amount);
          p.currentRoundBet = Math.max(0, (p.currentRoundBet || 0) - amount);
          state.pot = Math.max(0, state.pot - amount);
          state.isAllInActive = true;
          if (!state.allInPendingPlayerIds.includes(p.id)) {
            state.allInPendingPlayerIds.push(p.id);
          }
          state.isShowdownPending = false;
          state.currentTurnIndex = pIdx;
          handled = true;
        }
      }
    }

    // 5. Went All-In (e.g. "🔥 Player 3 went ALL-IN (+75 chips ...)")
    if (!handled) {
      const allInMatch = actionText.match(/🔥\s*(.+?)\s+went ALL-IN\s+\(\+(\d+)\s+chips/i);
      if (allInMatch) {
        const pName = allInMatch[1].trim();
        undonePlayerName = pName;
        const amount = parseInt(allInMatch[2], 10) || 0;
        const pIdx = state.players.findIndex(p => p.name === pName);
        if (pIdx !== -1) {
          const p = state.players[pIdx];
          p.chips += amount;
          p.currentHandBet = Math.max(0, (p.currentHandBet || 0) - amount);
          p.currentRoundBet = Math.max(0, (p.currentRoundBet || 0) - amount);
          state.pot = Math.max(0, state.pot - amount);
          state.isAllInActive = false;
          state.allInInitiatorId = null;
          state.allInInitiatorName = null;
          state.allInTargetBet = 0;
          state.allInPendingPlayerIds = [];
          state.isShowdownPending = false;
          state.currentTurnIndex = pIdx;
          const active = getActivePlayers();
          state.turnsInCurrentRound = Math.max(0, active.length - 1);
          handled = true;
        }
      }
    }

    // 6. Looked at cards
    if (!handled) {
      const seenMatch = actionText.match(/^(.+?)\s+looked at cards \(Now Seen \/ Chaal\)/i);
      if (seenMatch) {
        const pName = seenMatch[1].trim();
        undonePlayerName = pName;
        const pIdx = state.players.findIndex(p => p.name === pName);
        if (pIdx !== -1) {
          const p = state.players[pIdx];
          p.isBlind = true;
          state.isShowdownPending = false;
          state.currentTurnIndex = pIdx;
          handled = true;
        }
      }
    }

    if (handled) {
      if (typeof pIdx !== 'undefined' && pIdx !== -1) {
        const pId = state.players[pIdx].id;
        if (!state.pendingRoundPlayerIds.includes(pId)) {
          state.pendingRoundPlayerIds.unshift(pId);
        }
      }
      const hadRoundAdvance = state.actionHistory.slice(0, actionIdx + 1).some(entry => entry.text && entry.text.includes('begins'));
      if (hadRoundAdvance) {
        state.roundNumber = Math.max(1, state.roundNumber - 1);
      }
      state.actionHistory.splice(0, actionIdx + 1);
      logAction(`↺ Undid last action: ${undonePlayerName}'s turn restored`, 'round-entry');
      sound.playTone(400, 'triangle', 0.12, 0.1);
      renderAll();
      saveStateToStorage();
      updateUndoButtonState();
      return true;
    }

    return false;
  }

  function performUndo() {
    if (state.undoStack.length === 0) {
      if (rollbackLastPlayerAction()) {
        return;
      }
      return;
    }
    const snapshot = state.undoStack.pop();
    
    state.handNumber = snapshot.handNumber;
    state.dealerIndex = snapshot.dealerIndex;
    state.isHandActive = snapshot.isHandActive;
    state.pot = snapshot.pot;
    state.currentBlindStake = snapshot.currentBlindStake;
    state.roundNumber = snapshot.roundNumber;
    state.currentTurnIndex = snapshot.currentTurnIndex;
    state.turnsInCurrentRound = snapshot.turnsInCurrentRound;
    state.pendingRoundPlayerIds = Array.isArray(snapshot.pendingRoundPlayerIds) ? [...snapshot.pendingRoundPlayerIds] : [];
    state.isAllInActive = snapshot.isAllInActive || false;
    state.allInInitiatorId = snapshot.allInInitiatorId || null;
    state.allInInitiatorName = snapshot.allInInitiatorName || null;
    state.allInTargetBet = snapshot.allInTargetBet || 0;
    state.allInPendingPlayerIds = snapshot.allInPendingPlayerIds || [];
    state.isShowdownPending = snapshot.isShowdownPending || false;
    state.players = snapshot.players;
    state.actionHistory = snapshot.actionHistory;

    sound.playTone(400, 'triangle', 0.12, 0.1);
    renderAll();
    saveStateToStorage();
    updateUndoButtonState();
  }

  function updateUndoButtonState() {
    const canUndo = state.undoStack.length > 0 || (state.isHandActive && canRollbackLastAction());
    const btnUndo = document.getElementById('btnUndo');
    if (btnUndo) {
      btnUndo.disabled = !canUndo;
    }
    const btnUndoFromWinner = document.getElementById('btnUndoFromWinnerModal');
    if (btnUndoFromWinner) {
      btnUndoFromWinner.disabled = !canUndo;
    }
  }

  // --- Initialization & Setup ---
  function initializeDefaultPlayers(count = state.config.numPlayers) {
    state.players = [];
    for (let i = 0; i < count; i++) {
      state.players.push({
        id: `P${i + 1}`,
        name: `Player ${i + 1}`,
        chips: state.config.initialChips,
        initialChips: state.config.initialChips,
        isBlind: true,
        isFolded: false,
        currentHandBet: 0,
        currentRoundBet: 0,
        handsWon: 0,
        color: PLAYER_COLORS[i % PLAYER_COLORS.length]
      });
    }
  }

  // --- Game Flow Engine ---

  /**
   * Start a new hand:
   * - Rotates dealer if hand > 1
   * - Auto-deducts boot amount (5) from every active player into Pot
   * - Sets round to 1, blind stake to boot amount
   * - First turn goes to the player next to the dealer
   */
  function startNewHand(explicitFirstPlayerIndex = null) {
    pushUndoSnapshot('Start New Hand');

    state.isHandActive = true;
    state.pot = 0;
    state.roundNumber = 1;
    state.turnsInCurrentRound = 0;
    state.currentBlindStake = state.config.bootAmount;
    state.actionHistory = [];

    // If an explicit next starter is given (e.g. from previous winner)
    if (explicitFirstPlayerIndex !== null) {
      state.dealerIndex = (explicitFirstPlayerIndex - 1 + state.players.length) % state.players.length;
    }

    // Reset All-In & Showdown state
    state.isAllInActive = false;
    state.isShowdownPending = false;
    state.allInInitiatorId = null;
    state.allInInitiatorName = null;
    state.allInTargetBet = 0;
    state.allInPendingPlayerIds = [];

    // Auto-deduct boot/ante from all players with chips
    const boot = state.config.bootAmount;
    state.players.forEach((p, idx) => {
      p.isBlind = true;
      p.isFolded = false;
      p.currentHandBet = 0;
      p.currentRoundBet = 0;

      const deduction = Math.min(p.chips, boot);
      p.chips -= deduction;
      p.currentHandBet = deduction;
      state.pot += deduction;

      if (deduction > 0) {
        logAction(`${p.name} placed Boot ante (-${deduction} chips)`, 'boot-entry');
      } else {
        logAction(`⚠️ ${p.name} has 0 chips (Owes Boot ante. Must Add Bankroll or Pack)`, 'fold-entry');
      }
    });

    // Starting turn is the first active player next to dealer
    state.currentTurnIndex = getNextActivePlayerIndex(state.dealerIndex);
    initPendingRoundPlayers();

    sound.playChipSound();
    renderAll();
    saveStateToStorage();
  }

  function initPendingRoundPlayers() {
    const startIdx = getNextActivePlayerIndex(state.dealerIndex);
    const n = state.players.length;
    const list = [];
    for (let i = 0; i < n; i++) {
      const idx = (startIdx + i) % n;
      const p = state.players[idx];
      if (p && !p.isFolded) {
        list.push(p.id);
      }
    }
    state.pendingRoundPlayerIds = list;
    state.turnsInCurrentRound = 0;
  }

  function getActivePlayers() {
    return state.players.filter(p => !p.isFolded);
  }

  function getNextActivePlayerIndex(fromIndex) {
    const n = state.players.length;
    let next = (fromIndex + 1) % n;
    let checked = 0;
    while (checked < n) {
      if (!state.players[next].isFolded) {
        return next;
      }
      next = (next + 1) % n;
      checked++;
    }
    return fromIndex;
  }

  function getRequiredBet(playerIndex) {
    const player = state.players[playerIndex];
    if (player.isBlind) {
      return state.currentBlindStake; // e.g. 5
    } else {
      return state.currentBlindStake * 2; // e.g. 10
    }
  }

  // --- Turn Progression & Round Counter ---
  function advanceTurn() {
    // Check if only one player remains active
    const active = getActivePlayers();
    if (active.length === 1) {
      handleSinglePlayerWin(active[0]);
      return;
    }

    // Ensure pending list is initialized if missing
    if (!Array.isArray(state.pendingRoundPlayerIds) || state.pendingRoundPlayerIds.length === 0) {
      initPendingRoundPlayers();
    }

    // Remove acting player from current round pending list
    const actingPlayer = state.players[state.currentTurnIndex];
    if (actingPlayer) {
      state.pendingRoundPlayerIds = state.pendingRoundPlayerIds.filter(id => id !== actingPlayer.id);
    }
    // Also remove any players who have folded
    state.pendingRoundPlayerIds = state.pendingRoundPlayerIds.filter(id => {
      const p = state.players.find(x => x.id === id);
      return p && !p.isFolded;
    });

    state.turnsInCurrentRound++;

    // When all active players have taken an action in this round, advance round
    if (state.pendingRoundPlayerIds.length === 0) {
      if (state.roundNumber < state.config.maxRounds) {
        state.roundNumber++;
        state.players.forEach(p => { p.currentRoundBet = 0; });
        state.currentTurnIndex = getNextActivePlayerIndex(state.dealerIndex);
        initPendingRoundPlayers();
        logAction(`--- Round ${state.roundNumber} of ${state.config.maxRounds} begins ---`, 'round-entry');
      } else {
        // Max rounds (Round 3) reached! Conclude hand with Showdown (No 4th round allowed!)
        logAction(`🏁 Max rounds (${state.config.maxRounds}) reached! Concluding hand with Showdown.`, 'round-entry');
        state.isShowdownPending = true;
        renderAll();
        saveStateToStorage();
        triggerShowdown('Max rounds (Round 3) reached');
        return;
      }
    } else {
      // Advance to next active player
      state.currentTurnIndex = getNextActivePlayerIndex(state.currentTurnIndex);
    }

    sound.playTurnBell();
    renderAll();
    saveStateToStorage();
  }

  // --- Player Actions ---

  /**
   * Pack / Fold: Player drops out of the current hand
   */
  function handleFold() {
    if (!state.isHandActive || state.isShowdownPending) return;
    const player = state.players[state.currentTurnIndex];
    
    pushUndoSnapshot(`${player.name} Folded`);
    player.isFolded = true;
    logAction(`${player.name} packed (Folded)`, 'fold-entry');
    sound.playFoldSound();

    const active = getActivePlayers();
    if (active.length === 1) {
      state.isAllInActive = false;
      handleSinglePlayerWin(active[0]);
      return;
    }

    // If an All-In round is active:
    if (state.isAllInActive) {
      // Remove folded player from pending list
      state.allInPendingPlayerIds = state.allInPendingPlayerIds.filter(id => id !== player.id);

      // Check if all active players have responded to the All-In
      if (state.allInPendingPlayerIds.length === 0) {
        const remainingActive = getActivePlayers();
        if (remainingActive.length === 1) {
          state.isAllInActive = false;
          handleSinglePlayerWin(remainingActive[0]);
        } else {
          logAction(`🏁 All active players have responded to All-In. Final Showdown!`, 'round-entry');
          state.isAllInActive = false;
          state.isShowdownPending = true;
          renderAll();
          saveStateToStorage();
          triggerShowdown('All-In Round Concluded');
        }
        return;
      }

      state.currentTurnIndex = getNextActivePlayerIndex(state.currentTurnIndex);
      sound.playTurnBell();
      renderAll();
      saveStateToStorage();
      return;
    }

    advanceTurn();
  }

  /**
   * All-In Action: Player pushes their entire remaining bankroll.
   * Locks all subsequent players into strictly two options: PACK or CALL ALL-IN.
   * Once all remaining active players respond, no further rounds occur—Showdown is triggered!
   */
  function handleAllIn() {
    if (!state.isHandActive || state.isAllInActive || state.isShowdownPending) return;
    const player = state.players[state.currentTurnIndex];
    if (player.chips <= 0) return;

    const reqBet = getRequiredBet(state.currentTurnIndex);
    const isFinalRound = state.roundNumber >= state.config.maxRounds;
    const isLastTurnOfRound = Array.isArray(state.pendingRoundPlayerIds) && 
      state.pendingRoundPlayerIds.length === 1 && 
      state.pendingRoundPlayerIds[0] === player.id;

    if (isFinalRound && isLastTurnOfRound && player.chips > reqBet) {
      alert(`Cannot raise / go All-In for more than the current call on the final turn of Round 3.`);
      return;
    }

    pushUndoSnapshot(`${player.name} went ALL-IN`);

    const pushAmount = player.chips;
    player.chips = 0;
    player.currentHandBet += pushAmount;
    player.currentRoundBet = (player.currentRoundBet || 0) + pushAmount;
    state.pot += pushAmount;

    state.isAllInActive = true;
    state.allInInitiatorId = player.id;
    state.allInInitiatorName = player.name;
    state.allInTargetBet = player.currentRoundBet;

    // Remaining active players who must respond (either Pack or Call All-In)
    const pending = state.players.filter(p => !p.isFolded && p.id !== player.id);
    state.allInPendingPlayerIds = pending.map(p => p.id);

    logAction(`🔥 ${player.name} went ALL-IN (+${pushAmount} chips in Round ${state.roundNumber})! All remaining players must Call All-In or Pack.`, 'chaal-entry');
    sound.playTone(600, 'triangle', 0.25, 0.2);
    setTimeout(() => sound.playTone(900, 'triangle', 0.35, 0.2), 120);

    animatePotPop();

    if (state.allInPendingPlayerIds.length === 0) {
      handleSinglePlayerWin(player);
      return;
    }

    // Advance to next active player
    state.currentTurnIndex = getNextActivePlayerIndex(state.currentTurnIndex);
    sound.playTurnBell();
    renderAll();
    saveStateToStorage();
  }

  /**
   * Call All-In: Matches the All-In target bet
   */
  function handleCallAllIn() {
    if (!state.isHandActive || !state.isAllInActive || state.isShowdownPending) return;
    const player = state.players[state.currentTurnIndex];
    const diff = Math.max(0, state.allInTargetBet - (player.currentRoundBet || 0));

    // Rule: Player must have enough bankroll to match the All-In call!
    if (player.chips < diff) {
      alert(`${player.name} does not have enough bankroll to call the All-In (${diff} chips needed, has ${player.chips} chips). Please Top Up bankroll or Pack.`);
      return;
    }

    pushUndoSnapshot(`${player.name} Called ALL-IN`);

    const actualCall = diff;
    player.chips -= actualCall;
    player.currentHandBet += actualCall;
    player.currentRoundBet = (player.currentRoundBet || 0) + actualCall;
    state.pot += actualCall;

    logAction(`⚡ ${player.name} called ALL-IN (-${actualCall} chips in Round ${state.roundNumber})`, 'chaal-entry');
    sound.playChipSound();
    animatePotPop();

    // Remove player from pending list
    state.allInPendingPlayerIds = state.allInPendingPlayerIds.filter(id => id !== player.id);

    // If all players have responded, the hand strictly finishes with Showdown!
    if (state.allInPendingPlayerIds.length === 0) {
      const active = getActivePlayers();
      if (active.length === 1) {
        state.isAllInActive = false;
        handleSinglePlayerWin(active[0]);
      } else {
        logAction(`🏁 All active players have responded to All-In. Concluding final round with Showdown!`, 'round-entry');
        state.isAllInActive = false;
        state.isShowdownPending = true;
        renderAll();
        saveStateToStorage();
        triggerShowdown('All-In Round Concluded');
      }
      return;
    }

    // Advance to next active player
    state.currentTurnIndex = getNextActivePlayerIndex(state.currentTurnIndex);
    sound.playTurnBell();
    renderAll();
    saveStateToStorage();
  }

  /**
   * See Cards: Player sees cards (Blind -> Seen).
   * Once a player has seen cards, they CANNOT return to Blind for the rest of the hand.
   */
  function handleSeeCards() {
    if (!state.isHandActive || state.isShowdownPending) return;
    const player = state.players[state.currentTurnIndex];
    if (!player.isBlind) return; // Cannot un-see cards
    
    pushUndoSnapshot(`${player.name} Saw Cards`);
    player.isBlind = false;
    logAction(`${player.name} looked at cards (Now Seen / Chaal)`, 'chaal-entry');

    renderAll();
    saveStateToStorage();
  }

  /**
   * Automatically synchronizes any unpaid boot antes for active players who have chips.
   * Ensures players who were added mid-hand or who topped up always have their boot collected.
   */
  function syncPendingBootAntes() {
    if (!state.isHandActive) return false;
    let anyDeducted = false;
    const boot = state.config.bootAmount;

    state.players.forEach(p => {
      if (p.isFolded) return;
      const currentPaid = p.currentHandBet || 0;
      const owed = Math.max(0, boot - currentPaid);
      if (owed > 0 && p.chips > 0) {
        const deduction = Math.min(p.chips, owed);
        p.chips -= deduction;
        p.currentHandBet = currentPaid + deduction;
        state.pot += deduction;
        logAction(`🪙 ${p.name} placed Boot ante (-${deduction} chips)`, 'boot-entry');
        anyDeducted = true;
      }
    });

    if (anyDeducted) {
      animatePotPop();
    }
    return anyDeducted;
  }

  /**
   * Add Chips / Rebuy to Player Bankroll
   * Default & minimum is 100 chips.
   */
  function addPlayerChips(playerIndex, amount = 100) {
    const finalAmount = Math.max(100, parseInt(amount, 10) || 100);
    const player = state.players[playerIndex];
    if (!player) return;

    pushUndoSnapshot(`${player.name} Added ${finalAmount} Chips`);

    player.chips += finalAmount;
    player.initialChips += finalAmount;

    logAction(`💰 ${player.name} added +${finalAmount} chips (Bankroll now: ${player.chips})`, 'boot-entry');
    sound.playChipSound();
    setTimeout(() => sound.playChipSound(), 120);

    // Auto-collect boot ante if hand is active and player owes boot
    syncPendingBootAntes();

    renderAll();
    saveStateToStorage();
  }

  /**
   * Call / Chaal / Blind: Matches current table stake
   */
  function handleCall() {
    if (!state.isHandActive || state.isShowdownPending) return;
    const player = state.players[state.currentTurnIndex];
    const amount = getRequiredBet(state.currentTurnIndex);

    pushUndoSnapshot(`${player.name} Called ${amount}`);

    const actualDeduction = Math.min(player.chips, amount);
    player.chips -= actualDeduction;
    player.currentHandBet += actualDeduction;
    player.currentRoundBet = (player.currentRoundBet || 0) + actualDeduction;
    state.pot += actualDeduction;

    const actionType = player.isBlind ? 'Blind' : 'Chaal';
    logAction(`${player.name} played ${actionType} (-${actualDeduction} chips)`, 'chaal-entry');
    sound.playChipSound();

    animatePotPop();
    advanceTurn();
  }

  /**
   * Raise Stake:
   * Rule: The next call/raise MUST be strictly higher than the current call!
   * It cannot be less than or equal to the previous call.
   */
  function handleRaise(targetAmount) {
    if (!state.isHandActive || state.isShowdownPending) return;
    const player = state.players[state.currentTurnIndex];

    const isFinalRound = state.roundNumber >= state.config.maxRounds;
    const isLastTurnOfRound = Array.isArray(state.pendingRoundPlayerIds) && 
      state.pendingRoundPlayerIds.length === 1 && 
      state.pendingRoundPlayerIds[0] === player.id;

    if (isFinalRound && isLastTurnOfRound) {
      alert(`Cannot raise on the final turn of Round 3 because the round concludes with Showdown and subsequent players cannot call.`);
      return;
    }

    const currentRequired = getRequiredBet(state.currentTurnIndex);

    // Rule: Next bet/raise must be strictly greater than the current required call
    if (targetAmount <= currentRequired) {
      alert(`A raise must be higher than the current call (${currentRequired} chips). You entered ${targetAmount}.`);
      return;
    }

    pushUndoSnapshot(`${player.name} Raised to ${targetAmount}`);

    const actualDeduction = Math.min(player.chips, targetAmount);
    player.chips -= actualDeduction;
    player.currentHandBet += actualDeduction;
    player.currentRoundBet = (player.currentRoundBet || 0) + actualDeduction;
    state.pot += actualDeduction;

    if (player.isBlind) {
      state.currentBlindStake = targetAmount;
    } else {
      // Seen player raised
      state.currentBlindStake = targetAmount / 2;
    }

    const newChaal = state.currentBlindStake * 2;
    const newBlind = state.currentBlindStake;
    logAction(`${player.name} RAISED to ${targetAmount} chips! (Current Call now: ${newChaal} Seen / ${newBlind} Blind)`, 'chaal-entry');
    sound.playChipSound();

    animatePotPop();
    advanceTurn();
  }

  /**
   * Showdown:
   * When 2 players remain or Round 3 ends, players show cards and winner is selected.
   */
  function triggerShowdown(reason = 'Showdown') {
    state.isShowdownPending = true;
    renderAll();
    saveStateToStorage();
    const active = getActivePlayers();
    openWinnerModal(active);
  }

  function handleSinglePlayerWin(winner) {
    awardPotToWinner(winner, 'All other players folded');
  }

  function awardPotToWinner(winner, reason = '') {
    const potWon = state.pot;
    winner.chips += potWon;
    winner.handsWon++;
    state.isHandActive = false;
    state.isAllInActive = false;
    state.isShowdownPending = false;
    state.allInInitiatorId = null;
    state.allInInitiatorName = null;
    state.allInTargetBet = 0;
    state.allInPendingPlayerIds = [];

    // Record session hand
    state.sessionHistory.push({
      handNumber: state.handNumber,
      winnerName: winner.name,
      pot: potWon,
      reason: reason,
      date: new Date().toLocaleTimeString()
    });

    logAction(`🏆 ${winner.name} won the pot of ${potWon} chips! (${reason})`, 'win-entry');
    sound.playWinFanfare();

    // Next round/hand starts from the player next to the winner!
    // As per user specification: "If P3 wins it, the next round will start from P4."
    const winnerIndex = state.players.findIndex(p => p.id === winner.id);
    const nextFirstPlayer = (winnerIndex + 1) % state.players.length;
    state.dealerIndex = winnerIndex; // Dealer button moves to winner; next player starts

    showCelebrationOverlay(winner, potWon, state.players[nextFirstPlayer].name);
    state.handNumber++;

    renderAll();
    saveStateToStorage();
  }

  function logAction(text, entryClass = '') {
    const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    state.actionHistory.unshift({
      text,
      timestamp,
      entryClass
    });
  }

  // --- UI Animation & Render Helpers ---
  function animatePotPop() {
    const potContainer = document.getElementById('potContainer');
    if (potContainer) {
      potContainer.classList.remove('pot-pulse');
      void potContainer.offsetWidth; // trigger reflow
      potContainer.classList.add('pot-pulse');
    }
  }

  function showCelebrationOverlay(winner, potAmount, nextStarterName) {
    const overlay = document.getElementById('celebrationOverlay');
    const title = document.getElementById('celebrationTitle');
    const potEl = document.getElementById('celebrationPot');
    const subEl = document.getElementById('celebrationSub');

    title.textContent = `${winner.name} Wins!`;
    potEl.textContent = `+${potAmount} Chips`;
    subEl.textContent = `Pot awarded! Next hand will start from ${nextStarterName}.`;
    overlay.style.display = 'flex';
  }

  // --- Rendering UI State ---
  function renderAll() {
    renderHeader();
    renderCenterPot();
    renderPlayerPods();
    renderActionDock();
    updateUndoButtonState();
  }

  function renderHeader() {
    document.getElementById('handBadge').textContent = `Hand #${state.handNumber}`;
    document.getElementById('roundBadge').textContent = `Round ${state.roundNumber} / ${state.config.maxRounds}`;
    
    const active = getActivePlayers().length;
    document.getElementById('activePlayersBadge').textContent = `${active} Players Active`;
  }

  function renderCenterPot() {
    document.getElementById('potAmount').textContent = state.pot.toLocaleString();
    document.getElementById('currentBlindStake').textContent = state.currentBlindStake;
    document.getElementById('currentChaalStake').textContent = state.currentBlindStake * 2;
    document.getElementById('tableBootAmount').textContent = state.config.bootAmount;

    const bannerText = document.getElementById('turnBannerText');
    if (!state.isHandActive) {
      bannerText.textContent = 'Hand complete. Deal to start next hand!';
    } else if (state.isShowdownPending) {
      bannerText.innerHTML = `🏁 <strong style="color: var(--gold-primary);">ROUND ${state.roundNumber} COMPLETE:</strong> Hand is at Showdown! <a href="javascript:void(0)" id="linkShowdownBanner" style="color: #fde047; text-decoration: underline; margin-left: 6px; cursor: pointer; font-weight: 700;">Select Winner (${state.pot} Chips Pot) ➔</a>`;
      const link = document.getElementById('linkShowdownBanner');
      if (link) {
        link.onclick = (e) => {
          e.preventDefault();
          openWinnerModal(getActivePlayers());
        };
      }
    } else if (state.isAllInActive) {
      const activePlayer = state.players[state.currentTurnIndex];
      const diff = Math.max(0, state.allInTargetBet - (activePlayer.currentRoundBet || 0));
      if (activePlayer.chips < diff) {
        bannerText.innerHTML = `🔥 <strong style="color: #f87171;">ALL-IN ROUND:</strong> ${activePlayer.name}'s Turn (Needs <strong>${diff}</strong> Chips, Has <strong>${activePlayer.chips}</strong> — <strong>PACK</strong> or <strong>ADD BANKROLL</strong>)`;
      } else {
        bannerText.innerHTML = `🔥 <strong style="color: #f87171;">ALL-IN ROUND:</strong> ${activePlayer.name}'s Turn (Must <strong>PACK</strong> or <strong>CALL +${diff} CHIPS</strong>)`;
      }
    } else {
      const activePlayer = state.players[state.currentTurnIndex];
      const req = getRequiredBet(state.currentTurnIndex);
      const isFinalRound = state.roundNumber >= state.config.maxRounds;
      const isLastTurnOfRound = Array.isArray(state.pendingRoundPlayerIds) && 
        state.pendingRoundPlayerIds.length === 1 && 
        state.pendingRoundPlayerIds[0] === activePlayer.id;

      if (isFinalRound && isLastTurnOfRound) {
        bannerText.innerHTML = `🏁 <strong style="color: var(--gold-primary);">FINAL TURN OF ROUND ${state.roundNumber}:</strong> ${activePlayer.name}'s Turn (Call ${req} Chips to conclude hand, Pack, or Show)`;
      } else {
        bannerText.textContent = `${activePlayer.name}'s Turn (Must Call ≥ ${req} Chips)`;
      }
    }
  }

  /**
   * Positions player pods in a balanced layout around the table felt,
   * avoiding overlap with the central pot and stake display.
   */
  function renderPlayerPods() {
    const orbit = document.getElementById('playersOrbit');
    orbit.innerHTML = '';

    const total = state.players.length;
    
    // Dynamically apply density class based on player count
    orbit.classList.toggle('density-compact', total >= 9);
    orbit.classList.toggle('density-medium', total >= 6 && total <= 8);

    let positions = [];

    if (total === 4) {
      // Optimal 4-player quadrant placement:
      positions = [
        { x: 22, y: 74 },
        { x: 22, y: 26 },
        { x: 78, y: 26 },
        { x: 78, y: 74 }
      ];
    } else if (total === 2) {
      positions = [
        { x: 20, y: 50 },
        { x: 80, y: 50 }
      ];
    } else if (total === 3) {
      positions = [
        { x: 22, y: 74 },
        { x: 50, y: 16 },
        { x: 78, y: 74 }
      ];
    } else if (total === 5) {
      positions = [
        { x: 20, y: 74 },
        { x: 18, y: 32 },
        { x: 50, y: 16 },
        { x: 82, y: 32 },
        { x: 80, y: 74 }
      ];
    } else if (total === 6) {
      positions = [
        { x: 20, y: 74 },
        { x: 16, y: 50 },
        { x: 20, y: 26 },
        { x: 80, y: 26 },
        { x: 84, y: 50 },
        { x: 80, y: 74 }
      ];
    } else {
      // Smooth elliptical placement for 7 to 12 players
      // Generous clearance from central pot and between player cards
      const rx = total >= 9 ? 43 : 40;
      const ry = total >= 9 ? 40 : 37;
      for (let i = 0; i < total; i++) {
        // Start near bottom-left and distribute clockwise
        const angle = (Math.PI / 2) + (Math.PI / total) + (i * 2 * Math.PI / total);
        positions.push({
          x: Math.round(50 + rx * Math.cos(angle)),
          y: Math.round(50 + ry * Math.sin(angle))
        });
      }
    }

    state.players.forEach((p, index) => {
      const pos = positions[index] || { x: 50, y: 50 };
      const x = pos.x;
      const y = pos.y;

      const pod = document.createElement('div');
      pod.className = `player-pod`;
      pod.id = `pod-${p.id}`;
      pod.style.left = `${x}%`;
      pod.style.top = `${y}%`;

      const isCurrentTurn = state.isHandActive && index === state.currentTurnIndex;
      if (isCurrentTurn) pod.classList.add('active-turn');
      if (p.isFolded) pod.classList.add('folded');

      // Net P&L calculation
      const pnl = p.chips - p.initialChips;
      const pnlClass = pnl > 0 ? 'pnl-positive' : (pnl < 0 ? 'pnl-negative' : 'pnl-neutral');
      const pnlSign = pnl > 0 ? '+' : '';

      // Status badge
      let statusBadge = '';
      if (p.isFolded) {
        statusBadge = `<span class="pod-status-badge badge-folded">Folded</span>`;
      } else if (state.isHandActive && p.chips === 0 && p.currentHandBet > 0) {
        statusBadge = `<span class="pod-status-badge badge-allin">ALL-IN</span>`;
      } else if (p.isBlind) {
        statusBadge = `<span class="pod-status-badge badge-blind">Blind</span>`;
      } else {
        statusBadge = `<span class="pod-status-badge badge-seen">Seen</span>`;
      }

      // Dealer badge
      const isDealer = index === state.dealerIndex;
      const dealerMarkup = isDealer ? `<span class="dealer-button" title="Dealer">D</span>` : '';

      pod.innerHTML = `
        <div class="pod-header">
          <div class="pod-avatar" style="background-color: ${p.color};">
            ${p.id}
            ${dealerMarkup}
          </div>
          <div class="pod-meta">
            <div class="pod-name">${escapeHtml(p.name)}</div>
            ${statusBadge}
          </div>
        </div>

        <div class="pod-financials">
          <div class="pod-chips-box">
            <span class="chips-label">Bankroll</span>
            <span class="chips-val">${p.chips}</span>
          </div>
          <div class="pod-pnl ${pnlClass}">
            ${pnlSign}${pnl}
          </div>
        </div>

        <div class="pod-current-bet">
          <span>Bet in hand:</span>
          <span class="bet-badge">${p.currentHandBet}</span>
        </div>
      `;

      // Clicking on a pod allows looking at cards if it's their turn and they are blind (not during All-In)
      pod.addEventListener('click', () => {
        if (state.isHandActive && !state.isAllInActive && index === state.currentTurnIndex && !p.isFolded && p.isBlind) {
          handleSeeCards();
        }
      });

      // Clicking on the bankroll chips box opens top-up modal for that player anytime
      const chipsBox = pod.querySelector('.pod-chips-box');
      if (chipsBox) {
        chipsBox.title = 'Click to add extra bankroll / rebuy';
        chipsBox.style.cursor = 'pointer';
        chipsBox.addEventListener('click', (e) => {
          e.stopPropagation();
          openTopupModal(index);
        });
      }

      orbit.appendChild(pod);
    });
  }

  function renderActionDock() {
    const dockControls = document.getElementById('dockControls');
    const dockPrehand = document.getElementById('dockPrehand');
    const dockPlayerInfo = document.getElementById('dockPlayerInfo');

    if (!state.isHandActive) {
      dockControls.style.display = 'none';
      dockPlayerInfo.style.display = 'none';
      dockPrehand.style.display = 'flex';
      return;
    }

    dockControls.style.display = 'flex';
    dockPlayerInfo.style.display = 'flex';
    dockPrehand.style.display = 'none';

    const player = state.players[state.currentTurnIndex];
    const avatar = document.getElementById('dockPlayerAvatar');
    avatar.textContent = player.id;
    avatar.style.backgroundColor = player.color;

    document.getElementById('dockPlayerName').textContent = player.name;
    document.getElementById('dockPlayerChips').textContent = `Chips: ${player.chips}`;

    const dockStatus = document.getElementById('dockPlayerStatus');
    dockStatus.textContent = player.isBlind ? 'Blind' : 'Seen (Chaal)';
    dockStatus.className = `badge ${player.isBlind ? 'badge-blind' : 'badge-seen'}`;

    const btnFold = document.getElementById('btnFold');
    const btnToggleSeen = document.getElementById('btnToggleSeen');
    const btnToggleSeenTop = document.getElementById('btnToggleSeenTop');
    const btnToggleSeenSub = document.getElementById('btnToggleSeenSub');
    const btnCall = document.getElementById('btnCall');
    const btnCallTop = document.getElementById('btnCallTop');
    const btnCallSub = document.getElementById('btnCallSub');
    const btnAllIn = document.getElementById('btnAllIn');
    const btnAllInSub = document.getElementById('btnAllInSub');
    const btnCallAllIn = document.getElementById('btnCallAllIn');
    const btnCallAllInSub = document.getElementById('btnCallAllInSub');
    const topupGroup = document.getElementById('topupActionGroup');
    const raiseGroup = document.querySelector('.raise-group');
    const btnShow = document.getElementById('btnShow');

    // If Showdown is Pending (Max Rounds reached or Showdown triggered)
    if (state.isShowdownPending) {
      btnFold.style.display = 'none';
      btnToggleSeen.style.display = 'none';
      btnCall.style.display = 'none';
      if (btnAllIn) btnAllIn.style.display = 'none';
      if (btnCallAllIn) btnCallAllIn.style.display = 'none';
      if (raiseGroup) raiseGroup.style.display = 'none';
      if (topupGroup) topupGroup.style.display = 'none';

      // Show the prominent Showdown / Select Winner button
      if (btnShow) {
        btnShow.style.display = 'inline-flex';
        btnShow.disabled = false;
        const btnShowTop = btnShow.querySelector('.btn-top');
        const btnShowSub = document.getElementById('btnShowSub');
        if (btnShowTop) btnShowTop.textContent = '🏆 SELECT WINNER';
        if (btnShowSub) btnShowSub.textContent = `Award ${state.pot} Chips Pot`;
      }

      const avatar = document.getElementById('dockPlayerAvatar');
      avatar.textContent = '🏆';
      avatar.style.backgroundColor = 'var(--gold-primary)';
      avatar.style.color = '#000';

      document.getElementById('dockPlayerName').textContent = 'Hand Showdown';
      document.getElementById('dockPlayerChips').textContent = `Main Pot: ${state.pot} Chips`;

      const dockStatus = document.getElementById('dockPlayerStatus');
      dockStatus.textContent = `Round ${state.roundNumber} Ended`;
      dockStatus.className = 'badge badge-seen';
      return;
    }

    // If All-In is active:
    if (state.isAllInActive) {
      btnFold.style.display = 'inline-flex';
      btnCallAllIn.style.display = 'inline-flex';

      btnToggleSeen.style.display = 'none';
      btnCall.style.display = 'none';
      if (btnAllIn) btnAllIn.style.display = 'none';
      if (raiseGroup) raiseGroup.style.display = 'none';
      if (btnShow) btnShow.style.display = 'none';

      const diff = Math.max(0, state.allInTargetBet - (player.currentRoundBet || 0));
      const hasEnough = player.chips >= diff;
      const btnCallAllInTop = btnCallAllIn.querySelector('.btn-top');

      if (!hasEnough) {
        // Player does not have enough bankroll to match the All-In!
        btnCallAllIn.disabled = true;
        if (btnCallAllInTop) btnCallAllInTop.textContent = 'LOW CHIPS';
        btnCallAllInSub.textContent = `Need ${diff}, Have ${player.chips}`;

        // Present option to PACK or ADD BANKROLL
        topupGroup.style.display = 'inline-flex';
        const shortage = diff - player.chips;
        const quickAdd = Math.max(100, shortage);
        const btnQuickTopUp = document.getElementById('btnQuickTopUp');
        const btnCustomTopUp = document.getElementById('btnCustomTopUp');

        const quickTopText = btnQuickTopUp.querySelector('.btn-top');
        const quickSubText = btnQuickTopUp.querySelector('.btn-sub');
        if (quickTopText) quickTopText.textContent = `+${quickAdd} CHIPS`;
        if (quickSubText) quickSubText.textContent = `Cover All-In`;

        btnQuickTopUp.onclick = () => addPlayerChips(state.currentTurnIndex, quickAdd);
        btnCustomTopUp.onclick = () => openTopupModal(state.currentTurnIndex, shortage);
      } else {
        // Player has enough bankroll to match the All-In!
        btnCallAllIn.disabled = false;
        if (btnCallAllInTop) btnCallAllInTop.textContent = '⚡ CALL ALL-IN';
        btnCallAllInSub.textContent = `+${diff} Chips`;
        topupGroup.style.display = 'none';
      }
      return;
    }

    // Normal Betting Mode
    btnFold.style.display = 'inline-flex';
    btnCallAllIn.style.display = 'none';
    btnCall.style.display = 'inline-flex';
    if (raiseGroup) raiseGroup.style.display = 'flex';
    if (btnShow) btnShow.style.display = 'inline-flex';

    // Call / Chaal / Blind button & Insufficient Bankroll Top-Up Logic
    const reqBet = getRequiredBet(state.currentTurnIndex);
    const hasEnoughChips = player.chips >= reqBet;

    // In the final round (Round 3), the last player on whom the round will conclude cannot raise,
    // because no subsequent player will have an opportunity to call that raise before showdown.
    const isFinalRound = state.roundNumber >= state.config.maxRounds;
    const isLastTurnOfRound = Array.isArray(state.pendingRoundPlayerIds) && 
      state.pendingRoundPlayerIds.length === 1 && 
      state.pendingRoundPlayerIds[0] === player.id;
    const cannotRaiseInFinalRound = isFinalRound && isLastTurnOfRound;

    // All-In Button
    if (btnAllIn) {
      if (cannotRaiseInFinalRound && player.chips > reqBet) {
        btnAllIn.style.display = 'none';
      } else {
        btnAllIn.style.display = 'inline-flex';
        btnAllIn.disabled = player.chips <= 0;
        btnAllInSub.textContent = player.chips > 0 ? `+${player.chips} Chips` : '0 Chips';
      }
    }

    // See Cards button: Once seen, cannot un-see cards
    if (player.isBlind) {
      btnToggleSeen.style.display = 'inline-flex';
      btnToggleSeenTop.textContent = 'SEE CARDS';
      btnToggleSeenSub.textContent = 'Switch to Seen (2x Bet)';
    } else {
      // Once cards are seen, player CANNOT return to blind!
      btnToggleSeen.style.display = 'none';
    }

    if (!hasEnoughChips) {
      // Player does not have enough bankroll to take the Chaal!
      btnCall.disabled = true;
      btnCallTop.textContent = 'LOW CHIPS';
      btnCallSub.textContent = `Need ${reqBet}, Have ${player.chips}`;

      // Give two options: PACK (Fold) or ADD EXTRA BANKROLL (+100 default or custom)
      topupGroup.style.display = 'inline-flex';
      const btnQuickTopUp = document.getElementById('btnQuickTopUp');
      const btnCustomTopUp = document.getElementById('btnCustomTopUp');

      const quickTopText = btnQuickTopUp.querySelector('.btn-top');
      const quickSubText = btnQuickTopUp.querySelector('.btn-sub');
      if (quickTopText) quickTopText.textContent = '+100 CHIPS';
      if (quickSubText) quickSubText.textContent = 'Add Bankroll';

      btnQuickTopUp.onclick = () => addPlayerChips(state.currentTurnIndex, 100);
      btnCustomTopUp.onclick = () => openTopupModal(state.currentTurnIndex, 100);

      if (raiseGroup) {
        raiseGroup.style.opacity = '0.35';
        raiseGroup.style.pointerEvents = 'none';
      }
    } else {
      btnCall.disabled = false;
      topupGroup.style.display = 'none';
      if (raiseGroup) {
        raiseGroup.style.opacity = '1';
        raiseGroup.style.pointerEvents = 'auto';
      }

      btnCallTop.textContent = player.isBlind ? 'BLIND' : 'CHAAL';
      if (cannotRaiseInFinalRound) {
        btnCallSub.textContent = `+${reqBet} Chips (Concludes Round ${state.roundNumber} ➔ Showdown)`;
      } else if (player.isBlind) {
        btnCallSub.textContent = `+${reqBet} Chips (½ of ${state.currentBlindStake * 2} Chaal)`;
      } else {
        btnCallSub.textContent = `+${reqBet} Chips (Matches Chaal)`;
      }
    }

    // Hide raise controls if this player is on the final turn of Round 3
    if (cannotRaiseInFinalRound && raiseGroup) {
      raiseGroup.style.display = 'none';
    }

    // Show button condition:
    // Can show when only 2 players remain or in round 3
    const activePlayers = getActivePlayers();
    if (btnShow) {
      const btnShowTop = btnShow.querySelector('.btn-top');
      if (btnShowTop) btnShowTop.textContent = 'SHOW';
      if (activePlayers.length <= 2 || state.roundNumber >= state.config.maxRounds) {
        btnShow.disabled = false;
        document.getElementById('btnShowSub').textContent = `Showdown (${activePlayers.length} left)`;
      } else {
        btnShow.disabled = true;
        document.getElementById('btnShowSub').textContent = `Need <= 2 players`;
      }
    }

    // Quick raise chips with exact target amounts (always strictly higher than current call)
    const btnRaiseQuick1 = document.getElementById('btnRaiseQuick1');
    const btnRaiseQuick2 = document.getElementById('btnRaiseQuick2');
    const btnRaiseQuick3 = document.getElementById('btnRaiseQuick3');

    const step1 = player.isBlind ? 5 : 10;
    const step2 = player.isBlind ? 10 : 20;
    const target1 = reqBet + step1;
    const target2 = reqBet + step2;
    const target3 = reqBet * 2 > target2 ? reqBet * 2 : target2 + step1;

    btnRaiseQuick1.textContent = `${target1}`;
    btnRaiseQuick1.title = `Raise call to ${target1} chips`;
    btnRaiseQuick1.onclick = () => handleRaise(target1);

    btnRaiseQuick2.textContent = `${target2}`;
    btnRaiseQuick2.title = `Raise call to ${target2} chips`;
    btnRaiseQuick2.onclick = () => handleRaise(target2);

    btnRaiseQuick3.textContent = `${target3}`;
    btnRaiseQuick3.title = `Raise call to ${target3} chips`;
    btnRaiseQuick3.onclick = () => handleRaise(target3);
  }

  // --- Modals Setup & Event Handlers ---

  // Top-Up / Add Bankroll Modal
  function openTopupModal(playerIndex, suggestedMin = 100) {
    const modal = document.getElementById('topupModal');
    const player = state.players[playerIndex];
    let reqBet = getRequiredBet(playerIndex);
    if (state.isAllInActive) {
      reqBet = Math.max(0, state.allInTargetBet - (player.currentRoundBet || 0));
    }
    const desc = document.getElementById('topupDesc');
    const input = document.getElementById('topupNumberInput');
    const display = document.getElementById('topupAmountDisplay');
    const presets = document.getElementById('topupPresets');

    const defaultTopup = Math.max(100, suggestedMin || (reqBet > player.chips ? reqBet - player.chips : 100));

    if (state.isAllInActive) {
      desc.innerHTML = `<strong>${escapeHtml(player.name)}</strong> has <strong>${player.chips}</strong> chips (needs <strong>${reqBet}</strong> chips to call All-In). Add extra bankroll to match the All-In bet.`;
    } else {
      desc.innerHTML = `<strong>${escapeHtml(player.name)}</strong> has <strong>${player.chips}</strong> chips (needs <strong>${reqBet}</strong> chips to call). Add extra bankroll to continue playing.`;
    }
    input.value = defaultTopup;
    input.min = 100;
    display.textContent = defaultTopup;

    input.oninput = () => {
      const val = Math.max(100, parseInt(input.value, 10) || 100);
      display.textContent = val;
    };

    presets.innerHTML = '';
    const presetAmounts = [defaultTopup, 100, 200, 500, 1000];
    const uniquePresets = [...new Set(presetAmounts)].filter(v => v >= 100).sort((a, b) => a - b);
    uniquePresets.forEach(val => {
      const btn = document.createElement('button');
      btn.className = 'btn btn-chip-quick';
      btn.textContent = `+${val}`;
      btn.onclick = () => {
        input.value = val;
        display.textContent = val;
      };
      presets.appendChild(btn);
    });

    document.getElementById('btnConfirmTopup').onclick = () => {
      const val = Math.max(100, parseInt(input.value, 10) || 100);
      addPlayerChips(playerIndex, val);
      modal.style.display = 'none';
    };

    modal.style.display = 'flex';
  }

  // Raise Modal
  function openRaiseModal() {
    const modal = document.getElementById('raiseModal');
    const player = state.players[state.currentTurnIndex];
    const currentBet = getRequiredBet(state.currentTurnIndex);
    const slider = document.getElementById('raiseSlider');
    const sliderMin = document.getElementById('sliderMin');
    const sliderMax = document.getElementById('sliderMax');
    const display = document.getElementById('raiseAmountDisplay');
    const presets = document.getElementById('raisePresets');
    const previewChaal = document.getElementById('previewChaalVal');
    const previewBlind = document.getElementById('previewBlindVal');

    const step = 5;
    const minRaise = currentBet + step;
    const maxRaise = Math.max(minRaise + 50, player.chips);

    slider.min = minRaise;
    slider.max = maxRaise;
    slider.step = step;
    slider.value = minRaise;
    sliderMin.textContent = `Min: ${minRaise}`;
    sliderMax.textContent = `Max: ${maxRaise}`;

    const updatePreview = (val) => {
      display.textContent = val;
      if (player.isBlind) {
        if (previewBlind) previewBlind.textContent = val;
        if (previewChaal) previewChaal.textContent = val * 2;
      } else {
        if (previewChaal) previewChaal.textContent = val;
        if (previewBlind) previewBlind.textContent = Math.round(val / 2);
      }
    };

    updatePreview(minRaise);

    slider.oninput = () => {
      updatePreview(slider.value);
    };

    presets.innerHTML = '';
    const presetValues = player.isBlind
      ? [minRaise, currentBet * 2, currentBet + 10, currentBet + 20]
      : [minRaise, currentBet * 2, currentBet + 10, currentBet + 20];

    [...new Set(presetValues)].forEach(val => {
      if (val >= minRaise && val <= maxRaise) {
        const btn = document.createElement('button');
        btn.className = 'btn btn-chip-quick';
        btn.textContent = `${val} Chips`;
        btn.onclick = () => {
          slider.value = val;
          updatePreview(val);
        };
        presets.appendChild(btn);
      }
    });

    document.getElementById('btnConfirmRaise').onclick = () => {
      handleRaise(parseInt(slider.value, 10));
      modal.style.display = 'none';
    };

    modal.style.display = 'flex';
  }

  // Winner Showdown Modal
  function openWinnerModal(activePlayers) {
    const modal = document.getElementById('winnerModal');
    const list = document.getElementById('winnerPlayerList');
    document.getElementById('winnerPotAmount').textContent = state.pot;
    updateUndoButtonState();

    list.innerHTML = '';
    activePlayers.forEach(p => {
      const item = document.createElement('div');
      item.className = 'winner-pick-item';
      item.innerHTML = `
        <div class="winner-pick-left">
          <div class="winner-pick-avatar" style="background-color: ${p.color};">${p.id}</div>
          <div>
            <div class="winner-pick-name">${escapeHtml(p.name)}</div>
            <div class="winner-pick-chips">${p.chips} chips (${p.isBlind ? 'Blind' : 'Seen'})</div>
          </div>
        </div>
        <div class="winner-pick-action">Select Winner ➔</div>
      `;
      item.onclick = () => {
        modal.style.display = 'none';
        awardPotToWinner(p, 'Won Showdown');
      };
      list.appendChild(item);
    });

    modal.style.display = 'flex';
  }

  // Hand History Modal
  function openHistoryModal() {
    const modal = document.getElementById('historyModal');
    const content = document.getElementById('historyContent');
    const tabCurrent = document.getElementById('tabCurrentHand');
    const tabSession = document.getElementById('tabSessionHands');

    function renderCurrentTab() {
      tabCurrent.classList.add('active');
      tabSession.classList.remove('active');
      content.innerHTML = '';

      if (state.actionHistory.length === 0) {
        content.innerHTML = `<p class="modal-desc" style="text-align: center; margin-top: 1rem;">No actions logged for the current hand yet.</p>`;
        return;
      }

      state.actionHistory.forEach(entry => {
        const item = document.createElement('div');
        item.className = `history-entry ${entry.entryClass}`;
        item.innerHTML = `
          <span>${entry.text}</span>
          <span class="history-entry-time">${entry.timestamp}</span>
        `;
        content.appendChild(item);
      });
    }

    function renderSessionTab() {
      tabCurrent.classList.remove('active');
      tabSession.classList.add('active');
      content.innerHTML = '';

      if (state.sessionHistory.length === 0) {
        content.innerHTML = `<p class="modal-desc" style="text-align: center; margin-top: 1rem;">No past hands completed yet in this session.</p>`;
        return;
      }

      state.sessionHistory.slice().reverse().forEach(h => {
        const item = document.createElement('div');
        item.className = 'history-entry win-entry';
        item.innerHTML = `
          <div>
            <strong>Hand #${h.handNumber}:</strong> 🏆 ${escapeHtml(h.winnerName)} won ${h.pot} chips
            <div style="font-size: 0.72rem; color: #94a3b8;">${h.reason}</div>
          </div>
          <span class="history-entry-time">${h.date}</span>
        `;
        content.appendChild(item);
      });
    }

    tabCurrent.onclick = renderCurrentTab;
    tabSession.onclick = renderSessionTab;
    renderCurrentTab();

    document.getElementById('btnClearHistory').onclick = () => {
      state.actionHistory = [];
      state.sessionHistory = [];
      renderCurrentTab();
      saveStateToStorage();
    };

    modal.style.display = 'flex';
  }

  // Rules & Hand Rankings Modal
  function openRulesModal() {
    const modal = document.getElementById('rulesModal');
    const tabCardRankings = document.getElementById('tabCardRankings');
    const tabTableRules = document.getElementById('tabTableRules');
    const contentCardRankings = document.getElementById('contentCardRankings');
    const contentTableRules = document.getElementById('contentTableRules');

    function showCardRankings() {
      tabCardRankings.classList.add('active');
      tabTableRules.classList.remove('active');
      contentCardRankings.style.display = 'block';
      contentTableRules.style.display = 'none';
    }

    function showTableRules() {
      tabTableRules.classList.add('active');
      tabCardRankings.classList.remove('active');
      contentTableRules.style.display = 'block';
      contentCardRankings.style.display = 'none';
    }

    tabCardRankings.onclick = showCardRankings;
    tabTableRules.onclick = showTableRules;

    // Default to card rankings tab
    showCardRankings();
    modal.style.display = 'flex';
  }

  // Session Leaderboard Modal
  function openLeaderboardModal() {
    const modal = document.getElementById('leaderboardModal');
    const tbody = document.getElementById('leaderboardBody');
    tbody.innerHTML = '';

    // Sort players by chips descending
    const sorted = [...state.players].sort((a, b) => b.chips - a.chips);
    const totalHands = Math.max(1, state.handNumber - 1);

    sorted.forEach((p, idx) => {
      const pnl = p.chips - p.initialChips;
      const pnlClass = pnl > 0 ? 'pnl-positive' : (pnl < 0 ? 'pnl-negative' : 'pnl-neutral');
      const pnlSign = pnl > 0 ? '+' : '';
      const winRate = totalHands > 0 ? ((p.handsWon / totalHands) * 100).toFixed(0) : '0';

      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><strong>#${idx + 1}</strong></td>
        <td>
          <span style="display: inline-block; width: 10px; height: 10px; border-radius: 50%; background: ${p.color}; margin-right: 6px;"></span>
          ${escapeHtml(p.name)}
        </td>
        <td><strong>${p.chips}</strong></td>
        <td><span class="pod-pnl ${pnlClass}">${pnlSign}${pnl}</span></td>
        <td>${p.handsWon}</td>
        <td>${winRate}%</td>
      `;
      tbody.appendChild(tr);
    });

    modal.style.display = 'flex';
  }

  // Settings Modal
  function openSettingsModal() {
    const modal = document.getElementById('settingsModal');
    const inputPlayers = document.getElementById('cfgNumPlayers');
    const inputChips = document.getElementById('cfgInitialChips');
    const inputBoot = document.getElementById('cfgBootAmount');
    const inputRounds = document.getElementById('cfgMaxRounds');
    const namesList = document.getElementById('cfgPlayerNamesList');

    inputPlayers.value = state.config.numPlayers;
    inputChips.value = state.config.initialChips;
    inputBoot.value = state.config.bootAmount;
    inputRounds.value = state.config.maxRounds;

    function renderNameInputs(count) {
      namesList.innerHTML = '';
      for (let i = 0; i < count; i++) {
        const curName = state.players[i] ? state.players[i].name : `Player ${i + 1}`;
        const div = document.createElement('div');
        div.innerHTML = `
          <input type="text" id="cfgPlayerName_${i}" value="${escapeHtml(curName)}" placeholder="Player ${i + 1}" maxlength="16">
        `;
        namesList.appendChild(div);
      }
    }

    renderNameInputs(state.config.numPlayers);

    document.getElementById('btnUpdatePlayersCount').onclick = () => {
      const c = Math.min(12, Math.max(2, parseInt(inputPlayers.value, 10) || 4));
      inputPlayers.value = c;
      renderNameInputs(c);
    };

    document.getElementById('btnSaveSettings').onclick = () => {
      const newCount = Math.min(12, Math.max(2, parseInt(inputPlayers.value, 10) || 4));
      const newChips = Math.max(10, parseInt(inputChips.value, 10) || 100);
      const newBoot = Math.max(1, parseInt(inputBoot.value, 10) || 5);
      const newRounds = Math.max(1, parseInt(inputRounds.value, 10) || 3);

      state.config.numPlayers = newCount;
      state.config.initialChips = newChips;
      state.config.bootAmount = newBoot;
      state.config.maxRounds = newRounds;

      // Adjust players array
      while (state.players.length < newCount) {
        const i = state.players.length;
        const newPlayer = {
          id: `P${i + 1}`,
          name: `Player ${i + 1}`,
          chips: newChips,
          initialChips: newChips,
          isBlind: true,
          isFolded: false,
          currentHandBet: 0,
          currentRoundBet: 0,
          handsWon: 0,
          color: PLAYER_COLORS[i % PLAYER_COLORS.length]
        };

        // If hand is currently active, new player joins the active hand and pays boot ante
        if (state.isHandActive) {
          const bootDeduction = Math.min(newPlayer.chips, state.config.bootAmount);
          newPlayer.chips -= bootDeduction;
          newPlayer.currentHandBet = bootDeduction;
          state.pot += bootDeduction;
          logAction(`➕ ${newPlayer.name} joined table & placed Boot ante (-${bootDeduction} chips)`, 'boot-entry');
          animatePotPop();
        }

        state.players.push(newPlayer);
      }
      if (state.players.length > newCount) {
        state.players = state.players.slice(0, newCount);
        if (state.currentTurnIndex >= state.players.length) {
          state.currentTurnIndex = 0;
        }
        if (state.dealerIndex >= state.players.length) {
          state.dealerIndex = 0;
        }
      }

      // Update names
      for (let i = 0; i < newCount; i++) {
        const nameInp = document.getElementById(`cfgPlayerName_${i}`);
        if (nameInp && nameInp.value.trim()) {
          state.players[i].name = nameInp.value.trim();
        }
      }

      // Sync any other pending boot antes
      syncPendingBootAntes();

      modal.style.display = 'none';
      renderAll();
      saveStateToStorage();
    };

    document.getElementById('btnResetSession').onclick = () => {
      modal.style.display = 'none';
      openResetModal();
    };

    modal.style.display = 'flex';
  }

  // Reset Game Modal & Full Session Wipe
  function openResetModal() {
    const modal = document.getElementById('resetModal');
    const inputChips = document.getElementById('resetStartingChips');
    const inputPlayers = document.getElementById('resetNumPlayers');

    inputChips.value = state.config.initialChips || 100;
    inputPlayers.value = state.config.numPlayers || 4;

    document.getElementById('btnConfirmReset').onclick = () => {
      const startingChips = Math.max(10, parseInt(inputChips.value, 10) || 100);
      const numPlayers = Math.min(12, Math.max(2, parseInt(inputPlayers.value, 10) || 4));

      resetEntireGame(startingChips, numPlayers);
      modal.style.display = 'none';
    };

    modal.style.display = 'flex';
  }

  function resetEntireGame(startingChips = 100, numPlayers = 4) {
    localStorage.removeItem(STORAGE_KEY);
    state.config.initialChips = startingChips;
    state.config.numPlayers = numPlayers;
    state.config.bootAmount = 5;
    state.config.maxRounds = 3;

    initializeDefaultPlayers(numPlayers);
    state.players.forEach(p => {
      p.chips = startingChips;
      p.initialChips = startingChips;
      p.handsWon = 0;
      p.isBlind = true;
      p.isFolded = false;
      p.currentHandBet = 0;
    });

    state.handNumber = 1;
    state.dealerIndex = 0;
    state.pot = 0;
    state.sessionHistory = [];
    state.actionHistory = [];
    state.undoStack = [];
    state.pendingRoundPlayerIds = [];

    logAction(`Game reset to factory start (${numPlayers} players with ${startingChips} chips each).`, 'win-entry');
    startNewHand();
  }

  function escapeHtml(str) {
    if (!str) return '';
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  // --- Attach DOM Event Listeners ---
  function initEventListeners() {
    // Header actions
    document.getElementById('btnUndo').addEventListener('click', performUndo);
    document.getElementById('btnRules').addEventListener('click', openRulesModal);
    document.getElementById('btnHistory').addEventListener('click', openHistoryModal);
    document.getElementById('btnLeaderboard').addEventListener('click', openLeaderboardModal);
    document.getElementById('btnSettings').addEventListener('click', openSettingsModal);
    document.getElementById('btnResetGameHeader').addEventListener('click', openResetModal);

    const btnSound = document.getElementById('btnSoundToggle');
    btnSound.addEventListener('click', () => {
      const isMuted = !sound.toggle();
      document.getElementById('soundIcon').textContent = isMuted ? '🔇' : '🔊';
    });

    // Action Dock
    document.getElementById('btnDealNewHand').addEventListener('click', () => startNewHand());
    document.getElementById('btnFold').addEventListener('click', handleFold);
    document.getElementById('btnToggleSeen').addEventListener('click', handleSeeCards);
    document.getElementById('btnCall').addEventListener('click', handleCall);
    document.getElementById('btnAllIn').addEventListener('click', handleAllIn);
    document.getElementById('btnCallAllIn').addEventListener('click', handleCallAllIn);
    document.getElementById('btnRaiseCustom').addEventListener('click', openRaiseModal);
    document.getElementById('btnShow').addEventListener('click', triggerShowdown);

    // Modal Closes
    document.getElementById('closeRulesModal').addEventListener('click', () => {
      document.getElementById('rulesModal').style.display = 'none';
    });
    document.getElementById('btnCloseRulesBtn').addEventListener('click', () => {
      document.getElementById('rulesModal').style.display = 'none';
    });

    document.getElementById('closeResetModal').addEventListener('click', () => {
      document.getElementById('resetModal').style.display = 'none';
    });
    document.getElementById('btnCancelReset').addEventListener('click', () => {
      document.getElementById('resetModal').style.display = 'none';
    });

    document.getElementById('closeTopupModal').addEventListener('click', () => {
      document.getElementById('topupModal').style.display = 'none';
    });
    document.getElementById('btnCancelTopup').addEventListener('click', () => {
      document.getElementById('topupModal').style.display = 'none';
    });

    document.getElementById('closeRaiseModal').addEventListener('click', () => {
      document.getElementById('raiseModal').style.display = 'none';
    });
    document.getElementById('btnCancelRaise').addEventListener('click', () => {
      document.getElementById('raiseModal').style.display = 'none';
    });

    const handleCloseWinnerModal = () => {
      document.getElementById('winnerModal').style.display = 'none';
      // If showdown was manually opened in round 1 or 2 with <= 2 players, allow closing back to normal turn
      if (state.isHandActive && state.roundNumber < state.config.maxRounds && !state.isAllInActive) {
        state.isShowdownPending = false;
      }
      renderAll();
      saveStateToStorage();
    };

    document.getElementById('closeWinnerModal').addEventListener('click', handleCloseWinnerModal);
    document.getElementById('btnCancelWinnerModal').addEventListener('click', handleCloseWinnerModal);

    const btnUndoFromWinner = document.getElementById('btnUndoFromWinnerModal');
    if (btnUndoFromWinner) {
      btnUndoFromWinner.addEventListener('click', () => {
        document.getElementById('winnerModal').style.display = 'none';
        state.isShowdownPending = false;
        const undone = performUndo();
        if (!undone) {
          renderAll();
        }
      });
    }

    document.getElementById('closeHistoryModal').addEventListener('click', () => {
      document.getElementById('historyModal').style.display = 'none';
    });
    document.getElementById('btnCloseHistoryBtn').addEventListener('click', () => {
      document.getElementById('historyModal').style.display = 'none';
    });

    document.getElementById('closeLeaderboardModal').addEventListener('click', () => {
      document.getElementById('leaderboardModal').style.display = 'none';
    });
    document.getElementById('btnCloseLeaderboardBtn').addEventListener('click', () => {
      document.getElementById('leaderboardModal').style.display = 'none';
    });

    document.getElementById('closeSettingsModal').addEventListener('click', () => {
      document.getElementById('settingsModal').style.display = 'none';
    });
    document.getElementById('btnCancelSettings').addEventListener('click', () => {
      document.getElementById('settingsModal').style.display = 'none';
    });

    // Celebration Overlay Next Hand
    document.getElementById('btnCelebrationNext').addEventListener('click', () => {
      document.getElementById('celebrationOverlay').style.display = 'none';
      startNewHand();
    });

    // Keyboard Shortcuts for Rapid Play
    window.addEventListener('keydown', (e) => {
      // Don't trigger shortcuts if modal or input is active
      if (['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName)) return;
      if (document.querySelector('.modal-backdrop[style*="display: flex"]')) return;

      if (e.key === ' ' || e.key === 'c' || e.key === 'C') {
        // Space or C = Call / Chaal / Call All-In
        e.preventDefault();
        if (state.isHandActive) {
          if (state.isShowdownPending) {
            openWinnerModal(getActivePlayers());
          } else if (state.isAllInActive) {
            handleCallAllIn();
          } else {
            handleCall();
          }
        }
      } else if (e.key === 'f' || e.key === 'F') {
        // F = Fold / Pack
        e.preventDefault();
        if (state.isHandActive && !state.isShowdownPending) handleFold();
      } else if (e.key === 's' || e.key === 'S') {
        // S = See cards (only if blind and NOT during All-In)
        e.preventDefault();
        if (state.isHandActive && !state.isAllInActive && !state.isShowdownPending && state.players[state.currentTurnIndex].isBlind) {
          handleSeeCards();
        }
      } else if (e.key === 'z' && (e.ctrlKey || e.metaKey)) {
        // Ctrl+Z = Undo
        e.preventDefault();
        performUndo();
      }
    });

    // Responsive table recalculation on window resize
    window.addEventListener('resize', () => {
      renderPlayerPods();
    });
  }

  // --- Bootloader ---
  function init() {
    const restored = loadStateFromStorage();
    if (!restored || state.players.length === 0) {
      initializeDefaultPlayers(state.config.numPlayers);
    }
    initEventListeners();

    // Auto-sync any pending boot antes for active players with chips (e.g. restored from storage)
    syncPendingBootAntes();

    // If an existing game is loaded where Round 3 has ended, ensure showdown state is active
    if (state.isHandActive && state.roundNumber >= state.config.maxRounds && state.turnsInCurrentRound === 0) {
      state.isShowdownPending = true;
    }

    renderAll();

    // Auto-start hand 1 if no active hand was loaded
    if (!state.isHandActive && state.handNumber === 1 && state.actionHistory.length === 0) {
      startNewHand();
    }
  }

  // Run on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
