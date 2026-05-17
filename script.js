 const apikey = "2dbca3caed9b2f7ee3ba7ab5012604d7";
let predictions = [];
let currentPredictionId = null;
let locationData = null;
let imageData = null;
let model;

function switchTab(tabName) {
    document.querySelectorAll('.tab').forEach(tab => tab.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));

    event.target.classList.add('active');
    document.getElementById(tabName).classList.add('active');

    if (tabName === 'metrics') loadMetrics();
    if (tabName === 'history') loadHistory();
}

function openImageModal() {
    document.getElementById('imageModal').classList.add('active');
}

function closeImageModal() {
    document.getElementById('imageModal').classList.remove('active');
}

function selectCamera() {
    closeImageModal();
    document.getElementById('cameraInput').click();
}

function selectGallery() {
    closeImageModal();
    document.getElementById('galleryInput').click();
}

async function fetchRealWeather(lat, lon) {


    try {

        const response = await fetch(
            `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&appid=${apikey}&units=metric`
        );

        const data = await response.json();

        const temp = data.main.temp;
        const humidity = data.main.humidity;
        const windSpeed = data.wind.speed * 3.6;

        const weatherMain = data.weather[0].main;

        let vegetation = "Medium";

        if (weatherMain === "Rain") {
            vegetation = "Low";
        }
        else if (weatherMain === "Clear") {
            vegetation = "High";
        }

        let riskScore = 0;

        // Temperature
        if (temp > 35) riskScore += 3;
        else if (temp > 30) riskScore += 2;
        else riskScore += 1;

        // Humidity
        if (humidity < 30) riskScore += 3;
        else if (humidity < 50) riskScore += 2;
        else riskScore += 1;

        // Wind
        if (windSpeed > 25) riskScore += 3;
        else if (windSpeed > 15) riskScore += 2;
        else riskScore += 1;

        // Vegetation
        if (vegetation === "High") riskScore += 3;
        else if (vegetation === "Medium") riskScore += 2;
        else riskScore += 1;

        locationData = {
            latitude: lat,
            longitude: lon,
            temperature: temp,
            humidity: humidity,
            windSpeed: parseFloat(windSpeed.toFixed(1)),
            vegetation: vegetation,
            riskScore: riskScore
        };

        document.getElementById("temperature").innerText =
            locationData.temperature + "°C";

        document.getElementById("humidity").innerText =
            locationData.humidity + "%";

        document.getElementById("windSpeed").innerText =
            locationData.windSpeed + " km/h";

        document.getElementById("vegetation").innerText =
            locationData.vegetation;

        updateCombinedResult();

    } catch (error) {

        alert("Weather API Error. Check API key.");
        console.error(error);
    }
}

function getLocation() {
    if (!navigator.geolocation) {
        alert("Geolocation not supported");
        return;
    }

    navigator.geolocation.getCurrentPosition((pos) => {
        const lat = pos.coords.latitude;
        const lon = pos.coords.longitude;

        document.getElementById("locationSection").style.display = "none";
        document.getElementById("riskDisplay").classList.add("active");

        fetchRealWeather(lat, lon);
    });
}

function handleImageUpload(event) {

    const file = event.target.files[0];

    if (!file) return;

    const reader = new FileReader();

    reader.onload = function (e) {

        const img = document.getElementById("uploadedImage");
        img.src = e.target.result;

        document.getElementById("imageResult").style.display = "block";

        // simple delay before analysis
        setTimeout(() => {
            analyzeImage(e.target.result);
        }, 500);
    };

    reader.readAsDataURL(file);
}
function analyzeImage(base64) {

    const img = document.getElementById("uploadedImage");
    const canvas = document.getElementById("smokeCanvas");
    const ctx = canvas.getContext("2d");

    const width = 300;
    const height = 200;

    img.onload = function () {

        canvas.width = width;
        canvas.height = height;

        ctx.drawImage(img, 0, 0, width, height);

        const data = ctx.getImageData(0, 0, width, height).data;

        let smokePixels = 0;

        for (let i = 0; i < data.length; i += 4) {

            const r = data[i];
            const g = data[i + 1];
            const b = data[i + 2];

            const brightness = (r + g + b) / 3;

            if (brightness > 120 && brightness < 240) {
                smokePixels++;
            }
        }

        const total = width * height;
        const smokePercent = (smokePixels / total) * 100;

        let score = 1;
        if (smokePercent > 50) score = 4;
        else if (smokePercent > 30) score = 3;
        else if (smokePercent > 15) score = 2;

        document.getElementById("smokeLevel").textContent =
            smokePercent.toFixed(2) + "%";

        imageData = {
            smokeLevel: smokePercent,
            imageRiskScore: score
        };

        updateCombinedResult();
    };

    img.src = base64;
}
/* ---------------- MODEL ---------------- */
async function loadModel() {
    model = await mobilenet.load();
    console.log("AI Model Loaded");
}

window.addEventListener('load', function () {
    loadModel();
    loadFromStorage();
});

/* ---------------- STORAGE ---------------- */

function saveToStorage() {
    localStorage.setItem("predictions", JSON.stringify(predictions));
}

function loadFromStorage() {
    const data = localStorage.getItem("predictions");
    predictions = data ? JSON.parse(data) : [];
}

/* ---------------- THRESHOLDS ---------------- */

function getThresholds() {
    return JSON.parse(localStorage.getItem("thresholds")) || {
        low: 7,
        moderate: 12,
        high: 15
    };
}

function updateThresholds(feedback) {
    let t = getThresholds();

    if (feedback === "false_alarm") {
        t.low += 0.5;
        t.moderate += 0.5;
    }

    if (feedback === "real_fire") {
        t.low = Math.max(1, t.low - 0.5);
        t.moderate = Math.max(5, t.moderate - 0.5);
    }

    localStorage.setItem("thresholds", JSON.stringify(t));
}

/* ---------------- SAVE PREDICTION ---------------- */

async function savePrediction(score, level) {

    const prediction = {
        id: Date.now().toString(),
        username: localStorage.getItem("currentUser"),
        timestamp: new Date().toISOString(),

        location: locationData,
        combinedRiskScore: score,
        finalRiskLevel: level,

        userConfirmation: "pending"
    };

    predictions.push(prediction);
    saveToStorage();

    currentPredictionId = prediction.id;
}

/* ---------------- CONFIRM ---------------- */

async function confirmPrediction(type) {

    if (!currentPredictionId) {
        alert("Please make a prediction first");
        return;
    }

    const index = predictions.findIndex(p => p.id === currentPredictionId);

    if (index !== -1) {
        predictions[index].userConfirmation = type;
        saveToStorage();

        updateThresholds(type);

        loadHistory();
        loadMetrics();

        document.getElementById("successMessage").classList.add("active");

        setTimeout(() => {
            document.getElementById("successMessage").classList.remove("active");
        }, 3000);
    }
}

/* ---------------- HISTORY ---------------- */

function loadHistory() {

    const user = localStorage.getItem("currentUser");

    const data = predictions.filter(p => p.username === user);

    document.getElementById("historyList").innerHTML =
        data.map(p => `
            <div class="history-item">
                <h4>${p.finalRiskLevel} Risk</h4>
                <p>Date: ${new Date(p.timestamp).toLocaleString()}</p>
                <p>Status: ${p.userConfirmation}</p>
            </div>
        `).join("") || "<p>No predictions yet</p>";
}

/* ---------------- METRICS ---------------- */

function loadMetrics() {

    const user = localStorage.getItem("currentUser");
    const data = predictions.filter(p => p.username === user);
    const confirmed = data.filter(p => p.userConfirmation !== "pending");

    let tp = 0, fp = 0, fn = 0, tn = 0;

    confirmed.forEach(p => {

        const systemFire = p.combinedRiskScore > 8;

        if (systemFire && p.userConfirmation === "real_fire") tp++;
        else if (systemFire && p.userConfirmation === "false_alarm") fp++;
        else if (!systemFire && p.userConfirmation === "real_fire") fn++;
        else if (!systemFire && p.userConfirmation === "no_fire") tn++;
    });

    const FIR = (fp + tn) ? (fp / (fp + tn)) * 100 : 0;
    const FRR = (tp + fn) ? (fn / (tp + fn)) * 100 : 0;
    const accuracy = confirmed.length ? ((tp + tn) / confirmed.length) * 100 : 0;

    document.getElementById("totalPredictions").textContent = confirmed.length;
    document.getElementById("confirmedFires").textContent = tp;
    document.getElementById("falseAlarms").textContent = fp;
    document.getElementById("missedDetections").textContent = fn;
    document.getElementById("firRate").textContent = FIR.toFixed(2) + "%";
    document.getElementById("frrRate").textContent = FRR.toFixed(2) + "%";
    document.getElementById("accuracy").textContent = accuracy.toFixed(2) + "%";
}

/* ---------------- COMBINED RESULT ---------------- */

async function updateCombinedResult() {

    if (!locationData || !imageData) return;

    const score =
        (locationData.riskScore * 0.5) +
        (imageData.imageRiskScore * 2);

    const t = getThresholds();

    let level = "LOW";

    if (score <= t.low) level = "LOW";
    else if (score <= t.moderate) level = "MODERATE";
    else if (score <= t.high) level = "HIGH";
    else level = "EXTREME";

    document.getElementById("finalRisk").textContent =
        "Overall Risk: " + level;

    document.getElementById("combinedResult").style.display = "block";
    document.getElementById("confirmationSection").style.display = "block";

    if (!currentPredictionId) {
        await savePrediction(score, level);
    }
}

/* ---------------- IMAGE HANDLING (KEEP YOUR EXISTING ONE) ---------------- */
/* DO NOT CHANGE YOUR IMAGE + LOCATION CODE */

/* ---------------- INIT ---------------- */

window.addEventListener("load", () => {
    loadFromStorage();
});