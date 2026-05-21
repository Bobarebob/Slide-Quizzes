/**
 * Hydro-Buoyancy Cocktail Lab Application Controller
 * Handles UI interactions, recipe blending formulas, presets,
 * specific gravity guessing evaluation, and scientific logging.
 */

document.addEventListener('DOMContentLoaded', () => {
    // Initialise Physics Simulation
    const sim = new PhysicsSimulation('physics-canvas');
    
    // UI Elements
    const waterSlider = document.getElementById('water-volume');
    const whiskeySlider = document.getElementById('whiskey-volume');
    const boosterSlider = document.getElementById('booster-volume');
    
    const waterVal = document.getElementById('water-val');
    const whiskeyVal = document.getElementById('whiskey-val');
    const boosterVal = document.getElementById('booster-val');
    
    const mixtureVolume = document.getElementById('mixture-volume');
    const mixtureAbv = document.getElementById('mixture-abv');
    
    const pourBtn = document.getElementById('pour-btn');
    const resetBtn = document.getElementById('reset-btn');
    const dropIceBtn = document.getElementById('drop-ice-btn');
    
    const presetButtons = document.querySelectorAll('.btn-preset');
    
    // Guessing Game UI Elements
    const sgGuessInput = document.getElementById('sg-guess');
    const submitGuessBtn = document.getElementById('submit-guess-btn');
    const guessFeedback = document.getElementById('guess-feedback');
    
    const resultsBox = document.getElementById('results-box');
    const resultsActive = document.getElementById('results-active-content');
    const resultsPlaceholder = document.querySelector('.results-placeholder');
    const resGuessedSg = document.getElementById('res-guessed-sg');
    const resActualSg = document.getElementById('res-actual-sg');
    const resErrorSg = document.getElementById('res-error-sg');
    const resBadge = document.getElementById('res-badge');
    const resComment = document.getElementById('res-comment');
    
    // Telemetry & Diagnostics UI Elements
    const hudState = document.getElementById('hud-state');
    const hudAccel = document.getElementById('hud-accel');
    const hudVel = document.getElementById('hud-vel');
    
    const reportEmpty = document.getElementById('report-empty');
    const reportActive = document.getElementById('report-active');
    const reportStateTag = document.getElementById('report-state-tag');
    const measLabel = document.getElementById('meas-label');
    const measValDisplay = document.getElementById('meas-val');
    const apparentGDisplay = document.getElementById('telemetry-apparent-g');
    const equationDisplay = document.getElementById('equation-display');
    const calculationSteps = document.getElementById('calculation-steps');
    
    // Application State Variables
    let currentWater = 200; // ml
    let currentWhiskey = 0; // ml
    let currentBooster = 0; // ml
    let computedSg = 1.0000;
    let computedAbv = 0.0;
    
    let isPoured = false;
    let userGuess = null;
    let hasGuessed = false;

    // Specific Gravity Constants
    const SG_WATER = 1.0000;
    const SG_WHISKEY_50_PROOF = 0.94725; // 25% ABV (50 Proof, 50% scale definition)
    const SG_BOOSTER_150_PROOF = 0.84175; // 75% ABV (150 Proof)
    const SG_ICE = 0.9170;

    // Blends and Updates UI labels based on current slider values
    function updateMixtureProperties() {
        const wVol = parseInt(waterSlider.value);
        const whVol = parseInt(whiskeySlider.value);
        const bVol = parseInt(boosterSlider.value);
        
        currentWater = wVol;
        currentWhiskey = whVol;
        currentBooster = bVol;
        
        waterVal.textContent = wVol;
        whiskeyVal.textContent = whVol;
        boosterVal.textContent = bVol;
        
        const totalVol = wVol + whVol + bVol;
        
        if (totalVol === 0) {
            computedSg = 1.0000;
            computedAbv = 0.0;
            mixtureVolume.textContent = '0 ml';
            mixtureAbv.textContent = '0.0%';
            pourBtn.disabled = true;
            return;
        }
        
        pourBtn.disabled = false;
        mixtureVolume.textContent = `${totalVol} ml`;
        
        // Compute ABV: Weighted volumetric sum
        // 50 Proof Whiskey is 25% ABV, 150 Proof Booster is 75% ABV
        const abvFraction = (wVol * 0.0 + whVol * 0.25 + bVol * 0.75) / totalVol;
        computedAbv = abvFraction * 100;
        mixtureAbv.textContent = `${computedAbv.toFixed(1)}%`;
        
        // Compute Specific Gravity: Weighted density sum
        computedSg = (wVol * SG_WATER + whVol * SG_WHISKEY_50_PROOF + bVol * SG_BOOSTER_150_PROOF) / totalVol;
    }

    // Dynamic linear blending of liquid hex colors based on ingredients
    function getBlendedColor() {
        const totalVol = currentWater + currentWhiskey + currentBooster;
        if (totalVol === 0) return 'rgba(0,0,0,0)';
        
        // Rgb coefficients for water (cyan), whiskey (amber), booster (pink)
        const wColor = { r: 0, g: 243, b: 255, a: 0.25 };
        const whColor = { r: 212, g: 130, b: 23, a: 0.65 };
        const bColor = { r: 255, g: 0, b: 85, a: 0.70 };
        
        const r = (currentWater * wColor.r + currentWhiskey * whColor.r + currentBooster * bColor.r) / totalVol;
        const g = (currentWater * wColor.g + currentWhiskey * whColor.g + currentBooster * bColor.g) / totalVol;
        const b = (currentWater * wColor.b + currentWhiskey * whColor.b + currentBooster * bColor.b) / totalVol;
        const a = (currentWater * wColor.a + currentWhiskey * whColor.a + currentBooster * bColor.a) / totalVol;
        
        return `rgba(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)}, ${a.toFixed(2)})`;
    }

    // Apply slider changes
    waterSlider.addEventListener('input', () => {
        deactivatePresets();
        updateMixtureProperties();
    });
    
    whiskeySlider.addEventListener('input', () => {
        deactivatePresets();
        updateMixtureProperties();
    });
    
    boosterSlider.addEventListener('input', () => {
        deactivatePresets();
        updateMixtureProperties();
    });

    // Preset Recipies
    presetButtons.forEach(btn => {
        btn.addEventListener('click', (e) => {
            deactivatePresets();
            e.target.classList.add('active');
            
            const presetName = e.target.getAttribute('data-preset');
            
            if (presetName === 'distilled-water') {
                waterSlider.value = 200;
                whiskeySlider.value = 0;
                boosterSlider.value = 0;
            } else if (presetName === 'weak-whiskey') {
                waterSlider.value = 120;
                whiskeySlider.value = 80;
                boosterSlider.value = 0;
            } else if (presetName === 'neat-whiskey') {
                waterSlider.value = 0;
                whiskeySlider.value = 200;
                boosterSlider.value = 0;
            } else if (presetName === 'sinking-booster') {
                waterSlider.value = 0;
                whiskeySlider.value = 120;
                boosterSlider.value = 80; // 45% ABV (Sg < 0.917 -> SINK!)
            }
            
            updateMixtureProperties();
        });
    });

    function deactivatePresets() {
        presetButtons.forEach(btn => btn.classList.remove('active'));
    }

    // Pour Drink
    pourBtn.addEventListener('click', () => {
        if (isPoured) return;
        
        const color = getBlendedColor();
        const totalVol = currentWater + currentWhiskey + currentBooster;
        
        sim.pour(totalVol, computedSg, color);
        
        isPoured = true;
        pourBtn.disabled = true;
        disableSliders(true);
        
        // Active "Drop Ice" state
        dropIceBtn.classList.remove('disabled');
        dropIceBtn.disabled = false;
        
        hudState.textContent = 'READY';
        hudState.className = 'hud-value neon-cyan';
    });

    // Reset Glass
    resetBtn.addEventListener('click', () => {
        sim.reset();
        
        // Reset local variables
        isPoured = false;
        userGuess = null;
        hasGuessed = false;
        
        // Restore controls
        disableSliders(false);
        pourBtn.disabled = false;
        dropIceBtn.disabled = true;
        dropIceBtn.classList.add('disabled');
        
        // Reset Guessing Area
        sgGuessInput.value = '';
        sgGuessInput.disabled = false;
        submitGuessBtn.disabled = false;
        submitGuessBtn.classList.remove('disabled');
        guessFeedback.className = 'guess-feedback hidden';
        guessFeedback.textContent = '';
        
        resultsBox.className = 'results-box inactive';
        resultsActive.classList.add('hidden');
        resultsPlaceholder.classList.remove('hidden');
        
        // Reset Telemetry Display
        hudState.textContent = 'READY';
        hudState.className = 'hud-value neon-cyan';
        hudAccel.textContent = '-- m/s²';
        hudVel.textContent = '0.00 m/s';
        
        reportEmpty.classList.remove('hidden');
        reportActive.classList.add('hidden');
    });

    // Lock In Guess
    submitGuessBtn.addEventListener('click', () => {
        const val = parseFloat(sgGuessInput.value);
        if (isNaN(val) || val < 0.5 || val > 1.5) {
            alert('Please enter a valid Specific Gravity prediction (between 0.750 and 1.100)');
            return;
        }
        
        userGuess = val;
        hasGuessed = true;
        
        sgGuessInput.disabled = true;
        submitGuessBtn.disabled = true;
        submitGuessBtn.classList.add('disabled');
        
        guessFeedback.textContent = `🎯 Prediction locked in: SG = ${val.toFixed(4)}. Now deploy the ice cube!`;
        guessFeedback.className = 'guess-feedback locked';
    });

    // Drop Ice Cube
    dropIceBtn.addEventListener('click', () => {
        if (!isPoured) return;
        
        dropIceBtn.disabled = true;
        dropIceBtn.classList.add('disabled');
        
        sim.dropIce();
        
        hudState.textContent = 'DESCENDING';
        hudState.className = 'hud-value neon-amber';
    });

    function disableSliders(state) {
        waterSlider.disabled = state;
        whiskeySlider.disabled = state;
        boosterSlider.disabled = state;
        presetButtons.forEach(btn => btn.disabled = state);
    }

    // Connect Telemetry Updates from Physics Engine
    sim.onTelemetryUpdate = (data) => {
        // 1. Live HUD
        hudVel.textContent = `${data.realTimeVelocity.toFixed(2)} m/s`;
        
        if (data.isSettled) {
            hudState.textContent = data.isFloating ? 'FLOATING' : 'SUNK';
            hudState.className = data.isFloating ? 'hud-value neon-green' : 'hud-value neon-pink';
            hudAccel.textContent = '0.00 m/s²';
        } else {
            hudAccel.textContent = `${data.realTimeAccel.toFixed(2)} m/s²`;
        }

        // 2. Real-Time Telemetry Report Panel
        reportEmpty.classList.add('hidden');
        reportActive.classList.remove('hidden');
        
        if (data.isFloating) {
            reportStateTag.textContent = 'FLOATING STATE DETECTED';
            reportStateTag.className = 'report-header';
            
            measLabel.textContent = 'Submerged Fraction (f)';
            measValDisplay.textContent = `${(data.submergedFraction * 100).toFixed(1)}%`;
            apparentGDisplay.textContent = '0.00 m/s²';
            
            // Equation rendering (simulating beautiful HTML maths)
            equationDisplay.innerHTML = 'SG<sub>liquid</sub> = SG<sub>ice</sub> / f';
            
            const currentSubFraction = data.submergedFraction.toFixed(4);
            const calculatedSg = (SG_ICE / data.submergedFraction).toFixed(4);
            
            calculationSteps.innerHTML = `
                <div><strong>Measurement Phase:</strong> Cube is in hydrostatic equilibrium.</div>
                <div style="margin-top: 6px;"><strong>Submerged fraction (f):</strong> ${currentSubFraction}</div>
                <div><strong>Calculation:</strong></div>
                <div style="font-family: Orbitron; margin: 4px 0; color: #00f3ff;">
                    SG = 0.9170 / ${currentSubFraction} = <strong>${calculatedSg}</strong>
                </div>
                <div style="margin-top: 4px; font-size: 0.7rem; color: #c5c6c7;">
                    Liquid specific gravity is derived from the exact water displaced volume.
                </div>
            `;
            calculationSteps.className = 'calculation-steps';
        } else {
            reportStateTag.textContent = 'SINKING STATE DETECTED';
            reportStateTag.className = 'report-header sinking';
            
            measLabel.textContent = 'Submerged Fraction (f)';
            measValDisplay.textContent = '100.0%';
            
            // Apparent gravity
            apparentGDisplay.textContent = `${data.apparentG.toFixed(3)} m/s²`;
            
            equationDisplay.innerHTML = 'SG<sub>liquid</sub> = SG<sub>ice</sub> × (1 - g<sub>apparent</sub> / g)';
            
            const apparentRatio = (data.apparentG / 9.81).toFixed(4);
            const calculatedSg = (SG_ICE * (1 - (data.apparentG / 9.81))).toFixed(4);
            
            calculationSteps.innerHTML = `
                <div><strong>Measurement Phase:</strong> Ice exceeds liquid density.</div>
                <div style="margin-top: 6px;"><strong>Apparent Gravity (g<sub>app</sub>):</strong> ${data.apparentG.toFixed(3)} m/s²</div>
                <div><strong>Calculation:</strong></div>
                <div style="font-family: Orbitron; margin: 4px 0; color: #ff0055;">
                    SG = 0.9170 × (1 - ${data.apparentG.toFixed(3)} / 9.81) = <strong>${calculatedSg}</strong>
                </div>
                <div style="margin-top: 4px; font-size: 0.7rem; color: #c5c6c7;">
                    Liquid specific gravity is derived from the rate of downward acceleration.
                </div>
            `;
            calculationSteps.className = 'calculation-steps pink-border';
        }
    };

    // Trigger Game evaluation when simulation finishes
    sim.onSimulationComplete = (isFloating) => {
        if (!hasGuessed) {
            resultsBox.className = 'results-box inactive';
            resultsActive.classList.add('hidden');
            resultsPlaceholder.classList.remove('hidden');
            resultsPlaceholder.innerHTML = 'Calibration complete!<br><span style="color: #ffaa00; font-size: 0.75rem;">Next time, lock in your guess first to test your mixology score!</span>';
            return;
        }

        resultsPlaceholder.classList.add('hidden');
        resultsActive.classList.remove('hidden');
        resultsBox.className = 'results-box active';
        
        const actualSg = computedSg;
        const guessVal = userGuess;
        const error = Math.abs(guessVal - actualSg);
        
        resGuessedSg.textContent = guessVal.toFixed(4);
        resActualSg.textContent = actualSg.toFixed(4);
        resErrorSg.textContent = error.toFixed(4);
        
        let scoreText = '';
        let commentText = '';
        let badgeClass = 'score-badge';
        
        if (error <= 0.002) {
            scoreText = 'MASTER MIXOLOGIST! 🥇';
            commentText = 'Exceptional physical intuition! Calibration 100% aligned.';
            badgeClass += ' ';
        } else if (error <= 0.008) {
            scoreText = 'HYDROLOGY SCHOLAR! 🥈';
            commentText = 'Splendid guess! You understand ethanol density well.';
            badgeClass += ' sinking-style';
        } else if (error <= 0.020) {
            scoreText = 'APPRENTICE BARTENDER! 🥉';
            commentText = 'Not bad! Practice pouring more whiskey to master its gravity.';
            badgeClass += ' sinking-style';
        } else {
            scoreText = 'DROWNED IN BOOZE! ⚠️';
            commentText = 'Whoops! Did you forget that alcohol lowers liquid density?';
            badgeClass += ' fail-style';
        }
        
        resBadge.textContent = scoreText;
        resBadge.className = badgeClass;
        resComment.textContent = commentText;
    };

    // Run initial UI updates
    updateMixtureProperties();
});
