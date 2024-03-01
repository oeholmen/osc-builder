// Creating a simple liquid particle simulation with variable density dependent on temperature
const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
canvas.width = window.innerWidth;
canvas.height = window.innerHeight;

let particles = [];

const particleCount = 500;
const tempRange = {min: 0, max: 30}; // Temperature range in arbitrary units
let temperature = 15; // Initial temperature in the middle of the range

class Particle {
    constructor() {
        this.x = Math.random() * canvas.width;
        this.y = Math.random() * canvas.height;
        this.size = 5;
        this.speedX = Math.random() * 3 - 1.5;
        this.speedY = Math.random() * 3 - 1.5;
    }
    
    update() {
        this.x += this.speedX;
        this.y += this.speedY;
        
        // Simple boundary collision
        if (this.x < 0 || this.x > canvas.width) {
            this.speedX *= -1;
        }
        
        if (this.y < 0 || this.y > canvas.height) {
            this.speedY *= -1;
        }
    }
    
    draw() {
        ctx.fillStyle = 'blue';
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
        ctx.fill();
    }
}

function init() {
    particles = [];
    for (let i = 0; i < particleCount; i++) {
        particles.push(new Particle());
    }
}

function animate() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    let density = 1 - ((temperature - tempRange.min) / (tempRange.max - tempRange.min));
    
    for (let particle of particles) {
        particle.size = density * 5; // Adjust size based on density
        particle.update();
        particle.draw();
    }
    
    requestAnimationFrame(animate);
}

init();
animate();
