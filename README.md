# ♠ Teen Patti Score & Chip Tracker

An interactive digital poker table manager and scorekeeper designed for casual, home, and tournament Teen Patti games. It replaces physical chips or manual paper scorekeeping with automated bankroll tracking, blind/seen betting rates, round progression, and turn rotation.

---

## 🚀 How to Open and Run

Simply double-click or open `index.html` in any modern web browser (Chrome, Edge, Safari, Firefox).
No node, npm, server installation, or dependencies required!

```
File Location: c:\Users\User\Music\TP-tracker\index.html
```

### 🌐 Deploying to Vercel (Free & Instant)
This app is 100% static HTML5/CSS/JS, making it ideal for Vercel, Netlify, or GitHub Pages:
1. **Push to GitHub**: Push this folder to a GitHub repository.
2. **Import to Vercel**: Go to [vercel.com](https://vercel.com) $\rightarrow$ **Add New Project** $\rightarrow$ select your repository.
3. **Deploy**: Leave Build Command & Output Directory empty/default. Vercel automatically deploys it in seconds!
4. *(Optional)* A ready-to-use [`vercel.json`](file:///c:/Users/User/Music/TP-tracker/vercel.json) configuration file is already included.

---

## 🎮 Game Rules & Tracking Features

1. **Configurable Players ($N$):**
   - Supports **2 to 12 players** (e.g. 10 or 11 players at a table).
   - Dynamic table scaling with compact density modes so even 11–12 player tables fit cleanly with zero overlap.
   - Customizable player names and colors via the **Settings (⚙️)** modal.

2. **Starting Bankroll ($X$):**
   - Default: `100` chips per player (customizable in Settings).
   - Real-time Net P&L display (`+` / `-` chips) on each player's table pod.

3. **Auto Boot / Ante:**
   - At the beginning of each hand, the boot amount (`5` chips default) is automatically deducted from every active player and placed into the central **Main Pot**.

4. **Blind vs. Seen (Chaal) Mechanics & Half-Raise Rule:**
   - **Blind Players:** Bet is always **half of the current table Chaal / raise** (e.g., if Chaal is 20, Blind is 10; if Chaal is 40, Blind is 20).
   - **Seen Players (Chaal):** Bet matches the full current table stake (e.g. 20, 40).
   - **Seeing Cards is Permanent:** Clicking **"See Cards"** switches the player to Seen for the remainder of that hand. Once a player sees their cards, they **cannot** return to Blind (there is no "Play Blind" option). A Seen player only has the options to **Pack / Fold**, **Chaal (Call)**, or **Raise**.
   - **Raise Stakes & Monotonic Call Progression:**
     - The table call stake **never decreases**; it ratchets upward monotonically for the entire hand across all rounds.
     - When a player raises (e.g., P1 calls 10, P2 raises to 20), subsequent Seen players must call **at least 20** (or raise higher, e.g. 30).
     - If P3 raises to 30, and P4 calls 30, then when the round loops back to P1, **P1 must call 30** (or raise higher, or fold). P1 can never call 10 or 20 again.
     - If a Blind player is calling, they pay half of the current table Chaal (e.g., half of 20 = 10; half of 30 = 15; half of 40 = 20).
     - Any raise must be strictly greater than the current call (invalid/lower amounts are blocked).
   - **Insufficient Bankroll (Rebuy & Top-Up):**
     - If a player does not have enough chips to match the required call (e.g. Player 2 has 45 chips but Chaal is 60), the Call button disables (`LOW CHIPS`) and the player is presented with two clear choices:
       1. **PACK:** Fold the hand.
       2. **ADD BANKROLL (+100 CHIPS):** 1-click instant top-up of +100 chips (or custom amount $\ge 100$) so the player can continue in the hand.
     - Once bankroll is added, the Call and Raise options immediately re-enable.
     - Players can also add chips at any time by clicking their chip box on their table pod.
   - **Pack / Fold:** Exits the player from the current hand with zero further deductions.

5. **🔥 All-In Mode & Final Showdown Rule:**
   - Any active player on their turn can click **"🔥 ALL IN"** to push their entire remaining bankroll into the pot.
   - **Two Options Only for Next Players:** Once an All-In is initiated, all subsequent active players at the table are strictly presented with **two choices**:
     1. **PACK:** Fold the hand.
     2. **⚡ CALL ALL-IN:** Match the All-In bet (deducts exact difference needed to match the All-In initiator's total hand contribution).
     *(All other actions—Raise, See Cards, Normal Chaal—are disabled and hidden during the All-In round).*
   - **Strictly Final Round:** The action circulates until all remaining players have either folded or called the All-In. Once everyone has responded, **no further betting rounds occur**—the hand immediately concludes with the **Showdown** to select the winner.

6. **Round Limit & Showdown:**
   - Hand tracks betting rounds up to **3 rounds maximum** (or ends early if All-In is triggered or 1 player remains).
   - **Showdown:** Becomes available when only 2 players remain or at the end of Round 3.
   - If all players except one fold, the remaining player automatically wins the pot.

7. **Winner Pot Collection & Turn Rotation:**
   - Winner takes the entire accumulated pot.
   - Celebration modal announces the winner and pot amount.
   - **Starting Action Rotation:** The next hand automatically begins with the player to the left of the winner (e.g., if $P_3$ wins, $P_4$ starts next hand).

8. **Essential Table Utilities:**
   - **🔄 Reset Game:** Dedicated 1-click button in the top header to wipe and start a fresh session from scratch (resets all player bankrolls back to 100 chips, resets hand counter to Hand #1, and clears previous hand history).
   - **↺ Undo:** Full undo stack to revert misclicks or mistakes during fast-paced play.
   - **📜 Log:** Live timestamped action audit trail of every bet, fold, raise, and win.
   - **🏆 Scores:** Session leaderboard with chip rankings, net profits/losses, hands won, and win rates.
   - **🔊 Audio FX:** Built-in synthesizer sound effects for chip clinks, turn bells, folds, and winning fanfares (with mute toggle).
   - **💾 Auto-Save:** Automatically persists game state to `localStorage`.

---

## ⌨️ Quick Keyboard Shortcuts

| Key | Action |
| :--- | :--- |
| <kbd>Space</kbd> or <kbd>C</kbd> | Call / Chaal / Blind |
| <kbd>F</kbd> | Pack / Fold Hand |
| <kbd>S</kbd> | See Cards / Toggle Blind |
| <kbd>Ctrl</kbd> + <kbd>Z</kbd> | Undo Last Action |
