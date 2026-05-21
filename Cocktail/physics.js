/**
 * Hydro-Buoyancy Cocktail Physics Engine
 * Handles fluid simulation, particle splash systems, rigid body ice cube dynamics,
 * and high-precision calculations of buoyancy and apparent gravity.
 */

class PhysicsSimulation {
    constructor(canvasId) {
        this.canvas = document.getElementById(canvasId);
        this.ctx = this.canvas.getContext('2d');
        this.width = this.canvas.width;
        this.height = this.canvas.height;
        
        // Physical Constants (scaled for screen visual fidelity)
        this.g = 250; // standard acceleration due to gravity in pixels/s^2 (corresponds to 9.81 m/s^2)
        this.sgIce = 0.9170; // Specific gravity of pure water ice
        
        // Fluid Properties (default: pure water)
        this.sgLiquid = 1.0000;
        this.liquidColor = 'rgba(0, 243, 255, 0.25)'; // water blue-cyan
        this.liquidHeight = 0; // Current height of liquid in glass in pixels
        this.targetLiquidHeight = 0; // Target height for pouring animation
        this.liquidTop = this.height - 70; // Y coordinate of liquid surface
        
        // Glass Dimensions
        this.glassBottom = this.height - 70;
        this.glassWidth = 240;
        this.glassLeft = (this.width - this.glassWidth) / 2;
        
        // Ice Cube State
        this.cube = {
            width: 70,
            height: 70,
            x: (this.width - 70) / 2,
            y: -100, // start above screen
            vy: 0,
            ay: 0,
            isDropped: false,
            isSettled: false,
            splashTriggered: false,
            // Drag coefficient in liquid
            dragCoeff: 1.8,
            // Submerged fraction of cube volume
            submergedFraction: 0
        };
        
        // Particles for Splash Effects
        this.particles = [];
        
        // Telemetry Callback
        this.onTelemetryUpdate = null;
        this.onSimulationComplete = null;
        
        // Timing
        this.lastTime = 0;
        this.animationFrameId = null;
        
        this.init();
    }

    init() {
        this.ctx.clearRect(0, 0, this.width, this.height);
        this.drawGlassOutline();
    }

    /**
     * Resets the entire simulation to a clean state.
     */
    reset() {
        if (this.animationFrameId) {
            cancelAnimationFrame(this.animationFrameId);
            this.animationFrameId = null;
        }
        
        this.liquidHeight = 0;
        this.targetLiquidHeight = 0;
        this.liquidTop = this.glassBottom;
        
        this.cube = {
            width: 70,
            height: 70,
            x: (this.width - 70) / 2,
            y: -100,
            vy: 0,
            ay: 0,
            isDropped: false,
            isSettled: false,
            splashTriggered: false,
            dragCoeff: 1.8,
            submergedFraction: 0
        };
        
        this.particles = [];
        this.lastTime = 0;
        
        this.init();
    }

    /**
     * Fills the glass to a target height based on poured volume in ml.
     * Max volume is 400ml, corresponding to 250px height.
     */
    pour(volumeMl, sg, color) {
        this.sgLiquid = sg;
        this.liquidColor = color;
        
        // Scale 0-400ml to 0-250px
        const maxVolume = 400;
        const maxPixelHeight = 250;
        this.targetLiquidHeight = (Math.min(volumeMl, maxVolume) / maxVolume) * maxPixelHeight;
        
        // Start pour animation loop
        this.lastTime = performance.now();
        if (!this.animationFrameId) {
            this.loop(this.lastTime);
        }
    }

    /**
     * Releases the ice cube from the top.
     */
    dropIce() {
        this.cube.isDropped = true;
        this.cube.y = 30; // drop from just below HUD
        this.cube.vy = 0;
        this.cube.ay = this.g;
        this.cube.isSettled = false;
        this.cube.splashTriggered = false;
        
        this.lastTime = performance.now();
        if (!this.animationFrameId) {
            this.loop(this.lastTime);
        }
    }

    /**
     * Primary physics and render loop.
     */
    loop(time) {
        if (!this.lastTime) this.lastTime = time;
        let dt = (time - this.lastTime) / 1000;
        this.lastTime = time;
        
        // Cap dt to prevent instability
        if (dt > 0.1) dt = 0.1;
        
        this.updatePhysics(dt);
        this.render();
        
        if (this.animationFrameId !== null || this.cube.isDropped || this.liquidHeight < this.targetLiquidHeight) {
            this.animationFrameId = requestAnimationFrame((t) => this.loop(t));
        }
    }

    /**
     * Compute positions, velocities, buoyancy forces, and collision mechanics.
     */
    updatePhysics(dt) {
        // 1. Liquid Pouring animation
        if (this.liquidHeight < this.targetLiquidHeight) {
            this.liquidHeight += 120 * dt; // Pour speed (px/sec)
            if (this.liquidHeight > this.targetLiquidHeight) {
                this.liquidHeight = this.targetLiquidHeight;
            }
            this.liquidTop = this.glassBottom - this.liquidHeight;
        }

        // 2. Splash Particle update
        this.particles.forEach((p, idx) => {
            p.x += p.vx * dt;
            p.y += p.vy * dt;
            p.vy += this.g * 1.5 * dt; // slightly stronger gravity on splash drops
            p.life -= dt;
            
            // Remove dead particles
            if (p.life <= 0 || p.y > this.glassBottom) {
                this.particles.splice(idx, 1);
            }
        });

        // 3. Ice Cube physics
        if (this.cube.isDropped && !this.cube.isSettled) {
            const bottomOfCube = this.cube.y + this.cube.height;
            
            // Check if cube has touched liquid
            if (bottomOfCube > this.liquidTop) {
                
                // Trigger splash on initial contact
                if (!this.cube.splashTriggered) {
                    this.createSplash();
                    this.cube.splashTriggered = true;
                }
                
                // Calculate how much of the cube is submerged (height submerged)
                let submergedHeight = 0;
                if (this.cube.y < this.liquidTop) {
                    submergedHeight = bottomOfCube - this.liquidTop;
                } else {
                    submergedHeight = this.cube.height;
                }
                
                this.cube.submergedFraction = submergedHeight / this.cube.height;
                
                // --- Fluid Forces ---
                // Gravity: Fg = mass * g = sgIce * g
                const Fg = this.sgIce * this.g;
                
                // Buoyancy: Fb = sgLiquid * submerged_volume * g
                const Fb = this.sgLiquid * this.cube.submergedFraction * this.g;
                
                // Drag: Fd = -c * velocity (opposes motion)
                const Fd = -this.cube.dragCoeff * this.cube.vy * (1 + this.cube.submergedFraction * 2.5);
                
                // Net acceleration: a = F_net / mass = (Fg - Fb + Fd) / sgIce
                this.cube.ay = (Fg - Fb + Fd) / this.sgIce;
                
                // Special safety cap to prevent wild numerical launching
                if (this.cube.ay < -this.g * 3) this.cube.ay = -this.g * 3;
                
            } else {
                // Free fall in air
                this.cube.submergedFraction = 0;
                this.cube.ay = this.g;
            }
            
            // Update velocity and position
            this.cube.vy += this.cube.ay * dt;
            this.cube.y += this.cube.vy * dt;
            
            // Check glass bottom collision
            if (bottomOfCube >= this.glassBottom) {
                this.cube.y = this.glassBottom - this.cube.height;
                
                // Bounce dampening
                if (this.cube.vy > 10) {
                    this.cube.vy = -this.cube.vy * 0.15; // very low elasticity in liquid
                } else {
                    this.cube.vy = 0;
                    this.cube.ay = 0;
                    
                    // If liquid is too low density (so it sinks), it rests at the bottom
                    if (this.sgLiquid < this.sgIce) {
                        this.cube.isSettled = true;
                        this.cube.submergedFraction = 1.0;
                        if (this.onSimulationComplete) {
                            this.onSimulationComplete(false); // Sinking completed
                        }
                    }
                }
            }
            
            // Floating stability check: if bobs are extremely tiny, it settled floating
            if (this.sgLiquid >= this.sgIce && this.cube.submergedFraction > 0) {
                // Check if oscillations have dampened out
                const targetSubmergedHeight = (this.sgIce / this.sgLiquid) * this.cube.height;
                const actualSubmergedHeight = bottomOfCube - this.liquidTop;
                const deviation = Math.abs(actualSubmergedHeight - targetSubmergedHeight);
                
                if (Math.abs(this.cube.vy) < 1.0 && deviation < 0.2) {
                    this.cube.vy = 0;
                    this.cube.ay = 0;
                    this.cube.y = this.liquidTop + targetSubmergedHeight - this.cube.height;
                    this.cube.submergedFraction = this.sgIce / this.sgLiquid;
                    this.cube.isSettled = true;
                    
                    if (this.onSimulationComplete) {
                        this.onSimulationComplete(true); // Floating completed
                    }
                }
            }
            
            // Telemetry reporting callback
            if (this.onTelemetryUpdate) {
                // Map screen variables back to real physical units
                // Standard g = 9.81 m/s^2.
                // Accelerations are scaled by (9.81 / this.g)
                const scaleFactor = 9.81 / this.g;
                let realTimeAccel = this.cube.ay * scaleFactor;
                let realTimeVelocity = this.cube.vy * scaleFactor;
                
                // If settled, acceleration is 0
                if (this.cube.isSettled) {
                    realTimeAccel = 0;
                    realTimeVelocity = 0;
                }
                
                // If floating:
                const isFloating = this.sgLiquid >= this.sgIce;
                const apparentG = isFloating 
                    ? 0 
                    : 9.81 * (1 - (this.sgLiquid / this.sgIce));
                
                this.onTelemetryUpdate({
                    isFloating: isFloating,
                    isSettled: this.cube.isSettled,
                    submergedFraction: this.cube.submergedFraction,
                    realTimeAccel: realTimeAccel, // actual active simulation accel with drag
                    realTimeVelocity: realTimeVelocity,
                    apparentG: apparentG, // constant theoretical apparent gravity without drag
                });
            }
        }
    }

    /**
     * Triggers splashing particles at the liquid surface.
     */
    createSplash() {
        const pColor = this.liquidColor;
        const startX = this.cube.x + this.cube.width / 2;
        const startY = this.liquidTop;
        
        // Spawn 18 gorgeous water drops
        for (let i = 0; i < 18; i++) {
            const angle = (Math.PI / 6) + (Math.random() * (Math.PI * 2 / 3)); // upward arc
            const speed = 100 + Math.random() * 150;
            this.particles.push({
                x: startX + (Math.random() * 40 - 20),
                y: startY,
                vx: Math.cos(angle) * speed * (Math.random() > 0.5 ? 1 : -1),
                vy: -Math.sin(angle) * speed,
                size: 2 + Math.random() * 4,
                life: 0.5 + Math.random() * 0.4,
                color: pColor
            });
        }
    }

    /**
     * Renders all graphic assets on the Canvas.
     */
    render() {
        this.ctx.clearRect(0, 0, this.width, this.height);
        
        this.drawLiquid();
        this.drawSplashParticles();
        this.drawIceCube();
        this.drawLaserScanner();
        this.drawGlassOutline();
    }

    drawGlassOutline() {
        this.ctx.strokeStyle = '#ffffff';
        this.ctx.lineWidth = 4;
        
        // Dynamic Glowing Effect using shadow blurring
        this.ctx.shadowColor = 'rgba(0, 243, 255, 0.4)';
        this.ctx.shadowBlur = 12;
        
        // Cup Left Wall, Bottom, Right Wall
        this.ctx.beginPath();
        this.ctx.moveTo(this.glassLeft, 150);
        this.ctx.lineTo(this.glassLeft, this.glassBottom);
        this.ctx.lineTo(this.glassLeft + this.glassWidth, this.glassBottom);
        this.ctx.lineTo(this.glassLeft + this.glassWidth, 150);
        this.ctx.stroke();
        
        // Base structure
        this.ctx.fillStyle = 'rgba(255, 255, 255, 0.05)';
        this.ctx.fillRect(this.glassLeft - 10, this.glassBottom, this.glassWidth + 20, 10);
        
        // Reset shadows
        this.ctx.shadowBlur = 0;
    }

    drawLiquid() {
        if (this.liquidHeight <= 0) return;
        
        // Liquid body
        this.ctx.fillStyle = this.liquidColor;
        this.ctx.fillRect(
            this.glassLeft + 2, 
            this.liquidTop, 
            this.glassWidth - 4, 
            this.liquidHeight - 2
        );
        
        // Draw waves/meniscus at the surface
        this.ctx.fillStyle = this.liquidColor.replace(/[\d\.]+\)$/, '0.45)'); // slightly brighter top
        this.ctx.fillRect(
            this.glassLeft + 2,
            this.liquidTop - 3,
            this.glassWidth - 4,
            4
        );
    }

    drawSplashParticles() {
        this.particles.forEach((p) => {
            this.ctx.fillStyle = p.color;
            this.ctx.beginPath();
            this.ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
            this.ctx.fill();
        });
    }

    drawIceCube() {
        if (!this.cube.isDropped) return;
        
        this.ctx.save();
        
        // Position variables
        const x = this.cube.x;
        const y = this.cube.y;
        const w = this.cube.width;
        const h = this.cube.height;
        
        // Glassmorphic translucent styling for the ice cube
        this.ctx.fillStyle = 'rgba(255, 255, 255, 0.22)';
        this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
        this.ctx.lineWidth = 2.5;
        this.ctx.shadowColor = 'rgba(255, 255, 255, 0.4)';
        this.ctx.shadowBlur = 8;
        
        // Rounded rectangle for modern ice shape
        const radius = 8;
        this.ctx.beginPath();
        this.ctx.moveTo(x + radius, y);
        this.ctx.arcTo(x + w, y, x + w, y + h, radius);
        this.ctx.arcTo(x + w, y + h, x, y + h, radius);
        this.ctx.arcTo(x, y + h, x, y, radius);
        this.ctx.arcTo(x, y, x + w, y, radius);
        this.ctx.closePath();
        this.ctx.fill();
        this.ctx.stroke();
        
        // Reset shadow
        this.ctx.shadowBlur = 0;
        
        // Draw frosty highlights & internal structure (air bubbles)
        this.ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
        // Top-left diagonal highlight
        this.ctx.fillRect(x + 4, y + 4, w - 8, 2);
        this.ctx.fillRect(x + 4, y + 6, 2, h - 10);
        
        // Draw inner air cracks
        this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
        this.ctx.lineWidth = 1.5;
        this.ctx.beginPath();
        this.ctx.moveTo(x + 20, y + 20);
        this.ctx.lineTo(x + 30, y + 35);
        this.ctx.lineTo(x + 25, y + 50);
        this.ctx.stroke();
        
        this.ctx.beginPath();
        this.ctx.moveTo(x + 50, y + 15);
        this.ctx.lineTo(x + 45, y + 30);
        this.ctx.lineTo(x + 55, y + 48);
        this.ctx.stroke();
        
        // Draw waterline and ruler on the side of the cube if submerged
        if (this.cube.submergedFraction > 0 && this.cube.submergedFraction < 1.0) {
            const submergedY = this.liquidTop;
            
            // Draw digital sensor highlight at the waterline intersection
            this.ctx.strokeStyle = '#00f3ff';
            this.ctx.lineWidth = 2;
            this.ctx.beginPath();
            this.ctx.moveTo(x - 5, submergedY);
            this.ctx.lineTo(x + w + 5, submergedY);
            this.ctx.stroke();
            
            // Floating digital ruler text
            this.ctx.fillStyle = '#00f3ff';
            this.ctx.font = 'bold 10px Orbitron';
            this.ctx.fillText(
                `${Math.round(this.cube.submergedFraction * 100)}% SUB`, 
                x + w + 8, 
                submergedY + 4
            );
        }
        
        this.ctx.restore();
    }

    drawLaserScanner() {
        // Draws a futuristic sweeping scanning laser if cube is settling/measuring
        if (!this.cube.isDropped || !this.cube.isSettled) return;
        
        const y = this.cube.y;
        const w = this.cube.width;
        const h = this.cube.height;
        
        this.ctx.save();
        
        // Set laser properties (neon green for successful floating, cyan for sinking)
        const isFloating = this.sgLiquid >= this.sgIce;
        const laserColor = isFloating ? '#39ff14' : '#ff0055';
        
        this.ctx.strokeStyle = laserColor;
        this.ctx.shadowColor = laserColor;
        this.ctx.shadowBlur = 10;
        this.ctx.lineWidth = 1.5;
        
        // Draw scan lines
        const scanY = isFloating ? this.liquidTop : (y + h - 2);
        
        this.ctx.beginPath();
        this.ctx.moveTo(this.glassLeft, scanY);
        this.ctx.lineTo(this.glassLeft + this.glassWidth, scanY);
        this.ctx.stroke();
        
        // Draw subtle sweep gradient
        const grad = this.ctx.createLinearGradient(0, scanY - 15, 0, scanY + 15);
        grad.addColorStop(0, 'rgba(0,0,0,0)');
        grad.addColorStop(0.5, isFloating ? 'rgba(57, 255, 20, 0.15)' : 'rgba(255, 0, 85, 0.15)');
        grad.addColorStop(1, 'rgba(0,0,0,0)');
        this.ctx.fillStyle = grad;
        this.ctx.fillRect(this.glassLeft, scanY - 15, this.glassWidth, 30);
        
        this.ctx.restore();
    }
}

// Attach class globally
window.PhysicsSimulation = PhysicsSimulation;
