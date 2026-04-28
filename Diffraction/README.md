# Lab 4A – Diffraction Interactive Exercise

## Setup Instructions

### 1. Copy Videos
From the `Lab_4A_Misc.zip` archive, copy the two video files into the `videos/` folder:

```
lab4a/
  videos/
    Intro.mp4    ← copy from "Lab 4A Misc/Intro.mp4"
    Outro.mp4    ← copy from "Lab 4A Misc/Outro.mp4"
```

### 2. File Structure
```
lab4a/
  index.html          ← Login page (password: carrot)
  intro.html          ← Introduction with avatar video (Page 1 of 3)
  lab4a.html          ← Full diffraction simulation (Page 2 of 3)
  outro.html          ← Results + submit (Page 3 of 3)
  lab4a-shared.js     ← Firebase, session, timer, banner logic
  videos/
    Intro.mp4
    Outro.mp4
```

### 3. Deploy to GitHub Pages
Push the `lab4a/` folder to your `Slide-Quizzes` repo under `bobarebob.github.io/Slide-Quizzes/Lab4A/`.

### 4. Firebase (Optional)
- Uses the same `astronomy-course` Firebase project as your other quizzes.
- Student sessions are saved to the `students` collection with `labScore` and `completed` fields.
- If Firebase is unavailable, falls back to local password check (password: **carrot**).
- Password can also be managed via a Firebase `databases` collection entry (same pattern as other quizzes).

## Page Flow
1. **index.html** — Student enters name, ID, and password → redirected to intro
2. **intro.html** — Avatar video + learning objectives → button to Lab
3. **lab4a.html** — Full simulation (laser select → position → measure → calculate) → button to Results
4. **outro.html** — Avatar video + score display + **Submit Lab** button

## Scoring
- 6.0 pts total: 12 calculation steps × 0.5 pts each
- Score syncs to the banner in real-time as students complete calculations
- Submit button on outro sends final score to Firebase

## Navigation
- Timeline dots at the bottom of every page (3 dots: Intro · Lab · Results)
- Page counter in nav bar: 1/3 · 2/3 · 3/3
- Timer (if set in Firebase) with warnings at 3 min / 2 min / 1 min remaining
- Auto-redirect to outro on timeout
