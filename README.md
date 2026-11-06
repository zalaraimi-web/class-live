# Class Live — Live Classroom Competition

One game on the interactive board, one PIN, every student playing live from her own device.
No student accounts. No app to install. Nothing to `npm install`.

## Start it in class (Mac — one click)

1. Double-click **Start Class Live.command**. The first time it downloads its own copy of
   Node.js into this folder (checked against the official checksum) — no installer, no admin
   password. After that it starts in seconds, offline too. The teacher board opens by itself.
2. Students on the **same Wi-Fi** scan the QR code or type the address shown on the board.

First time only: if macOS blocks the file, go to System Settings → Privacy & Security →
**Open Anyway**. If asked whether node may accept incoming connections, click **Allow**.
The Mac stays awake while the game runs; double-clicking again just reopens the board;
if port 3000 is busy the game moves to the next free port automatically.
(Windows: install Node.js from nodejs.org, then run start-windows.bat.)

## Put it online (one permanent link, any network)

1. Create a free account on **github.com** → **+** → **New repository** → name it `class-live` → Create.
2. Click **uploading an existing file** and drag in everything *inside* this folder
   (including `render.yaml`, `public`, `quizzes`). Click **Commit changes**.
3. Create a free account on **render.com** using **Sign in with GitHub**.
4. Click **New** → **Blueprint** → choose `class-live`. Render reads `render.yaml` and
   asks for **TEACHER_PASSWORD**: type the password you'll use to open the teacher board.
5. Click **Deploy**. When it shows **Live**, your links are:
   - Teacher board: `https://<your-app>.onrender.com`
   - Students: `https://<your-app>.onrender.com/play` (the QR code uses it automatically)

Notes for the free plan: the site sleeps after inactivity, so open the teacher board a
couple of minutes before class. Quizzes typed in the online editor can be lost when the
service restarts; keep permanent quizzes as files in the `quizzes` folder on GitHub.

## Running a game

| Board button | What it does |
|---|---|
| **Start game** | Shows question 1 to everyone ("get ready" for 4 s, then answers open) |
| **Pause / Resume** (`P`) | Freezes the timer on the board and every phone |
| **+10 s** | More time for the current question |
| **Stop & reveal** | Closes the question early (it also closes by itself when time runs out or everyone answered) |
| **Leaderboard → Next question** (`Space`) | The next question only starts when you press it |
| **End game** | Jumps to the podium |
| **Lock joining** | Stops new students joining |
| Click a student's name in the lobby | Removes her (e.g. inappropriate name) |
| **🏅 Certificates** | Printable navy & gold certificates for every student (or top 3), with your name and school |
| **Download results** | Spreadsheet (CSV) of every student's answers and score |
| **Play again** | Same students, scores reset |

`F` = full screen, `M` = sound on/off.

**Settings when creating a game:** feedback on phones *instantly* or *after each question*
(use "after" if students can see each other's screens), late joining allowed or not,
shuffle questions.

## Your fixed identity (formal)
Cream paper, navy & gold, a 3D elegant serif title (Lora italic, bundled so it works offline),
and your real signature (`public/signature-navy.png`, plus gold and white versions) on the board,
the student join page and every certificate. No background doodles or slogans.
Edit **`public/brand.js`** to change the title words, subtitle, motto, signature file,
the name printed on certificates and your school. Colours live in `public/common.css`.

## Scoring
Correct answers earn 500–1000 points (faster = more), double-points questions earn twice that,
and answer streaks add a bonus of +100 per streak step (up to +500).

## Writing quizzes
Click **Write a new quiz** on the start screen:

```
Title: Science revision

Q: Which planet is closest to the Sun?
* Mercury
- Venus
- Earth
- Mars
time: 20

Q: Water boils at 100°C at sea level.
* True
- False
points: 2
```

`*` = correct answer, `-` = wrong answer (2–4 answers). Optional: `time:` seconds,
`points:` 0/1/2, `image:` picture link, `explain:` a short explanation shown after answering,
and `Category:` under the title. Arabic and English both work.

Included quizzes: **Grammar Battle – Grade 12** (15 True/False questions with grammar
explanations), Science Starter, and an Arabic sample.
Quizzes are saved as files in the `quizzes` folder.

## Answers stay private
Questions with their answers are only served to the computer running the game (or, online, to
someone with the teacher password). Phones receive a question's answer and explanation only after
that student has answered (instant feedback) or at the reveal.

## Reliability
- Phones that lose Wi-Fi reconnect automatically and keep their score; refreshing the page
  or closing the browser and coming back also resumes her place.
- If the teacher's board refreshes, the game continues where it was.
- If the server itself restarts, the game is restored from `data/games.json` (the question is
  paused so you can resume it).
- Tested with 30 simultaneous students; supports up to 120 per game.
