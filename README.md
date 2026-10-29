# Employee Attrition Predictor - 3D Edition

Setup (inside this folder):
    pip install -r requirements.txt
    python train_and_save.py     # creates the .pkl files, metrics.json and the CSV
    python app.py

Open http://127.0.0.1:5000

Folder layout (keep it exactly like this):
    app.py
    train_and_save.py
    requirements.txt
    templates/index.html
    static/style.css
    static/app.js

Needs internet for the Three.js library and Google Fonts (loaded from CDN).
