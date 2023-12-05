const canvas = document.getElementsByTagName('canvas')[0];
let ctx = undefined
let __scale = 2
try {
    ctx = canvas.getContext('2d');
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
}
catch (e) {
    console.log(e)
}
class Vector {
    constructor(x = 0, y = 0) {
        if (isNaN(x) || isNaN(y)) {
            throw new Error('Vector constructor arguments must be numbers.');
        }
        this._x = x;
        this._y = y;
    }
    get x() { return this._x; }
    get y() { return this._y; }
    set x(value) {
        if (isNaN(value)) { throw new Error('newValue is NaN'); }
        this._x = value;
    }
    set y(value) {
        if (isNaN(value)) { throw new Error('newValue is NaN'); }
        this._y = value;
    }
    add(v) { if(isNaN(v.x)||isNaN(v.y)) throw new Error('isNaN'); return new Vector(this.x + v.x, this.y + v.y); }
    sub(v) { if(isNaN(v.x)||isNaN(v.y)) throw new Error('isNaN'); return new Vector(this.x - v.x, this.y - v.y); }
    mul(s) { if(isNaN(s)) throw new Error('isNaN'); return new Vector(this.x * s, this.y * s); }
    div(s) { if(isNaN(s)) throw new Error('isNaN'); return new Vector(this.x / s, this.y / s); }
    mag() { return Math.sqrt(this.x * this.x + this.y * this.y); }
    norm() { return this.div(this.mag()); }
    distance(v) { if(isNaN(v.x)||isNaN(v.y)) throw new Error('isNaN'); return this.sub(v).mag(); }
    length() { return this.sub(new Vector(0, 0)).mag(); }
    distanceTo(v) { if(isNaN(v.x)||isNaN(v.y)) throw new Error('isNaN'); return this.distance(v); }
    dot(v) { if(isNaN(v.x)||isNaN(v.y)) throw new Error('isNaN'); return this.x * v.x + this.y * v.y; }
    cross(v) { if(isNaN(v.x)||isNaN(v.y)) throw new Error('isNaN'); return this.x * v.y - this.y * v.x; }
    rotate(a) {
        let c = Math.cos(a);
        let s = Math.sin(a);
        return new Vector(c * this.x - s * this.y, s * this.x + c * this.y);
    }
    set(v) { if(isNaN(v.x)||isNaN(v.y)) throw new Error('isNaN'); this.x = v.x; this.y = v.y; return this; }
    angle() { return Math.atan2(this.y, this.x); }
    acosh() { return Math.log(this.x + Math.sqrt(this.x * this.x - 1)); }
    scale(v) { if(isNaN(v.x)||isNaN(v.y)) throw new Error('isNaN'); return new Vector(this.x * v.x, this.y * v.y); }
    hyperbolicProjection(boundsRadius) {
        const p = this
        const r = Math.sqrt(p.x * p.x + p.y * p.y);
        const theta = Math.atan2(p.y, p.x);
        const scale = r / (1 + r / boundsRadius);
        return new Vector(scale * Math.cos(theta), scale * Math.sin(theta));
    }
    validate() { if (!isNaN(this.x) || !isNaN(this.y)) throw new Error('value isNaN!') }
    copy() { return new Vector(this.x, this.y); }
    toString() { return "(" + this.x + "," + this.y + ")"; }
    static polar(r, a) { return new Vector(r * Math.cos(a), r * Math.sin(a)); }
    static random() { return new Vector(Math.random(), Math.random()); }
    static fromAngle(a) { return new Vector(Math.cos(a), Math.sin(a)); }   
}
class Tripole {
    static get nonce() {
        if (!Tripole._nonce) Tripole._nonce = 0;
        return Tripole._nonce++;
    }
    constructor(name, environment = null, pos = new Vector(0, 0), entropic_degree = 0, genetics = null) {
        if (!(pos instanceof Vector)) {
            pos = new Vector(); // defaults to (0, 0)
        }
        this.name = name + '_' + Tripole.nonce;
        this.objects = [];
        this.environment = environment;
        this._position = pos;
        this._entropic_degree = entropic_degree;
        this.cycle_rate = 1;
        this.data = {
            energy: 0,
            entropy: 0,
            efficiency: 0.01
        };
        this.lastAction = null;
        this.environment && this.environment.objects.push(this);
        this.currentCycle = 0;
        this.mass = 1;
        this.velocity = new Vector(0, 0);  
        this.particleSystem = new ParticleSystem(); 
        if (!genetics) {
            this.genetics = {
                attractionCoefficient: Math.random() * 5,
                repulsionCoefficient: Math.random() * 5,
                sensorBias: Math.random() * 5,
                actuatorBias: Math.random() * 5,
                mediatorBias: Math.random() * 5,
                sensorThreshold: Math.random() * 5,
                actuatorThreshold: Math.random() * 5,
                mediatorThreshold: Math.random() * 5,
                sensorWeight: Math.random() * 5,
                actuatorWeight: Math.random() * 5,
                mediatorWeight: Math.random() * 5,
            };
        } else {
            this.genetics = genetics;
        }
        this.attractionCoefficient = this.genetics.attractionCoefficient;
        this.repulsionCoefficient = this.genetics.repulsionCoefficient;
        this.sensorBias = this.genetics.sensorBias;
        this.actuatorBias = this.genetics.actuatorBias;
        this.mediatorBias = this.genetics.mediatorBias;
        this.sensorThreshold = this.genetics.sensorThreshold;
        this.actuatorThreshold = this.genetics.actuatorThreshold;
        this.mediatorThreshold = this.genetics.mediatorThreshold;
        this.sensorWeight = this.genetics.sensorWeight;
        this.actuatorWeight = this.genetics.actuatorWeight;
        this.mediatorWeight = this.genetics.mediatorWeight;
        this.historical_fitness = [];
    }
    calculateFitness() {
        const nearbyTripoles = this.nearby(50); // Check within a radius of 50 for simplicity.
        const averageEntropy = nearbyTripoles.reduce((acc, tripole) => acc + tripole.data.entropy, 0) / (nearbyTripoles.length || 1);
        this.fitness = (1 / averageEntropy) * nearbyTripoles.length; 
        return this.fitness;
    }
    mutate() {
        const mutationRate = 0.1; // Mutation rate between 0 and 1.
        if (Math.random() < mutationRate) {
            // Change one or more traits by a small amount.
            this.genetics.attractionCoefficient += (Math.random() * 2 - 1) * 0.1; 
            this.genetics.repulsionCoefficient += (Math.random() * 2 - 1) * 0.1;
            this.genetics.sensorBias += (Math.random() * 2 - 1) * 0.1;
            this.genetics.actuatorBias += (Math.random() * 2 - 1) * 0.1;
            this.genetics.mediatorBias += (Math.random() * 2 - 1) * 0.1;
            this.genetics.sensorThreshold += (Math.random() * 2 - 1) * 0.1;
            this.genetics.actuatorThreshold += (Math.random() * 2 - 1) * 0.1;
            this.genetics.mediatorThreshold += (Math.random() * 2 - 1) * 0.1;
            this.genetics.sensorWeight += (Math.random() * 2 - 1) * 0.1;
            this.genetics.actuatorWeight += (Math.random() * 2 - 1) * 0.1;
            this.genetics.mediatorWeight += (Math.random() * 2 - 1) * 0.1;
        }
    }
    static crossover(parentA, parentB) {
        const genetics = {
            attractionCoefficient: (parentA.genetics.attractionCoefficient + parentB.genetics.attractionCoefficient) / 2,
            repulsionCoefficient: (parentA.genetics.repulsionCoefficient + parentB.genetics.repulsionCoefficient) / 2,
            sensorBias: (parentA.genetics.sensorBias + parentB.genetics.sensorBias) / 2,
            actuatorBias: (parentA.genetics.actuatorBias + parentB.genetics.actuatorBias) / 2,
            mediatorBias: (parentA.genetics.mediatorBias + parentB.genetics.mediatorBias) / 2,
            sensorThreshold: (parentA.genetics.sensorThreshold + parentB.genetics.sensorThreshold) / 2,
            actuatorThreshold: (parentA.genetics.actuatorThreshold + parentB.genetics.actuatorThreshold) / 2,
            mediatorThreshold: (parentA.genetics.mediatorThreshold + parentB.genetics.mediatorThreshold) / 2,
            sensorWeight: (parentA.genetics.sensorWeight + parentB.genetics.sensorWeight) / 2,
            actuatorWeight: (parentA.genetics.actuatorWeight + parentB.genetics.actuatorWeight) / 2,
            mediatorWeight: (parentA.genetics.mediatorWeight + parentB.genetics.mediatorWeight) / 2,
        };
        return genetics
    }
    get radius() { return this.energy; }
    get energy() { let totalEnergy = this.data.energy || 0; for (let sub_tripole of this.objects) { totalEnergy += sub_tripole.energy; } return totalEnergy; }
    get entropy() { let totalEntropy = this.data.entropy || 0; for (let sub_tripole of this.objects) { totalEntropy += sub_tripole.entropy; } return totalEntropy; }
    set pos(pos) { this._position = pos; }
    get pos() { return this._position; }
    get impedance() { return this.energy / this.entropy; }
    get entropic_degree() { return this.data.entropy / this.data.efficiency * 180; }
    get bounds() {
        if (!this.objects.length) return new Vector(0, 0);
        const min_x = Math.min(...this.objects.map((obj) => obj.pos.x));
        const max_x = Math.max(...this.objects.map((obj) => obj.pos.x));
        const min_y = Math.min(...this.objects.map((obj) => obj.pos.y));
        const max_y = Math.max(...this.objects.map((obj) => obj.pos.y));
        const width = max_x - min_x;
        const height = max_y - min_y;
        return new Vector(width, height);
    }
    remove(object) {
        let index = this.objects.indexOf(object);
        if (index !== -1) {
            this.objects.splice(index, 1);
            this.update_bounds();
        }
    }
    phase_impedance(phase) { return Math.abs(Math.sin(this.entropic_degree - phase)); }
    add(object) { this.objects.push(object); this.update_bounds(); }
    has(component) { return this.objects.includes(component); }
    clear() { this.objects = []; }
    nearby(distance) {
        const results = [];
        const worldSize = Math.sqrt(this.energy) * 4;

        for (let object of this.environment.objects) {
            if (object === this) continue;

            let directDist = this.pos.distance(object.pos);
            let wrappedDist = Math.min(
                this.pos.sub(object.pos.add(new Vector(worldSize, 0))).mag(),
                this.pos.sub(object.pos.sub(new Vector(worldSize, 0))).mag(),
                this.pos.sub(object.pos.add(new Vector(0, worldSize))).mag(),
                this.pos.sub(object.pos.sub(new Vector(0, worldSize))).mag()
            );

            if (distance > -1 && directDist > distance && wrappedDist > distance) continue;

            results.push(object);
        }
        return results;
    }
    update() {
        // Absorb energy and entropy from the environment.
        const inputData = this.absorb_entropy(
            this.environment,
            this.environment.data.energy,
            this.environment.data.entropy);
        if (!inputData) return; // Exit if no energy/entropy is available.
        const mediatedData = this.mediate_entropy(inputData);
        this.emit_entropy(this.environment, mediatedData.energy, mediatedData.entropy);

        let currentPowerInput = this.powerInput(time);
        let delta_E_O = this.flowFunctionF(this.data.energy, this.environment.data.energy, this.impedance());
        this.data.energy += currentPowerInput - delta_E_O;
        let delta_E_E = this.flowFunctionG(this.data.energy, this.environment.data.energy, this.impedance());
        this.environment.data.energy += delta_E_E;
        this.data.energy = Math.max(this.data.energy, 0);
        for (let object of this.objects) {
            object.update();
        }
        this.pos = this.pos.add(this.velocity.mul(this.cycle_rate));  // 'cycle_rate' can be used as a time step
        this.scale_to_bounds();
        this.update_bounds(); // Update self body (bounds, center)
        this.absorbPotentialChildren();
        this.currentCycle++;
    }

    update_bounds() {
        if (!this.objects.length) return;
        const positions = this.objects.map((object) => object.pos);
        const min_x = Math.min(...positions.map((pos) => pos.x));
        const max_x = Math.max(...positions.map((pos) => pos.x));
        const min_y = Math.min(...positions.map((pos) => pos.y));
        const max_y = Math.max(...positions.map((pos) => pos.y));
        const width = max_x - min_x;
        const height = max_y - min_y;
        const center = new Vector(min_x + width / 2, min_y + height / 2);
        this.scale_to_bounds();
        this._position = center;
    }

    render(ctx, parentRadius = null, parentPosition) {
        const radius = this.energy * this.energy
        const drawRadius = radius;
        const pos = parentPosition.add(this.pos)
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, Math.sqrt(radius), 0, Math.PI * 2);
        ctx.fillStyle = this.color();
        ctx.fill(); 
        this.objects.forEach(child => {
            child.render(ctx,  Math.sqrt(radius), this.pos);
        });
        this.particleSystem.render(ctx);
    }

    mediate_entropy(sensor_data) {
        const phase_impedance = this.phase_impedance(this.entropic_degree);
        if (sensor_data.energy > 0) {e
            let entropyRotation = this.calculate_entropy_rotation(sensor_data.entropy);
            this._entropic_degree = (this.entropic_degree + entropyRotation) % 180;
        }
        if (to instanceof Environment) {
            to.absorb_entropy(this, energy, sensor_data.entropy)
            this.data.energy -= energy;
            to.data.energy += energy;
            to._entropic_degree = this.entropic_degree;
        }
        return {
            energy: sensor_data.energy / (phase_impedance < 0.01 ? 0.01 : phase_impedance),
            entropy: sensor_data.entropy / (phase_impedance < 0.01 ? 0.01 : phase_impedance)
        }
    }
    absorb_entropy(from, energy, entropy) {
        if (from === this || this.objects.includes(from)) return;
        if (from instanceof Environment) {
            const absorbedEnergy = from.emit_entropy(this, energy, entropy)
            this.data.energy += absorbedEnergy;
            from.data.energy -= absorbedEnergy;
            this._entropic_degree = from.entropic_degree;
            return { energy: absorbedEnergy, entropy: 0 };
        }
        const availableEnergy = Math.min(from.data.energy, energy);
        const availableEntropy = Math.min(from.data.entropy, entropy)
        from.data.energy -= availableEnergy;
        from.data.entropy -= availableEntropy;
        this.data.energy += availableEnergy;
        this.data.entropy += availableEntropy;
        this._entropic_degree = from.entropic_degree;

        let distance = this.pos.distance(from.pos);
        let isTouching = distance < this.radius + from.radius;
        let isInside = this.environment === from.environment;

        if (isTouching && isInside) {
            const overlap = this.radius + from.radius - distance;
            const direction = this.pos.sub(from.pos).norm();
            const correction = direction.mul(overlap / 64);
            const _from = (from.energy / from.entropy) < (this.energy / this.entropy) ? from : this;
            const _to = (from.energy / from.entropy) < (this.energy / this.entropy) ? this : from;
            if (_from.energy > 0) _from.emit_entropy(_to, 1, 1 * from.energy / from.entropy);
            while (isTouching) {
                this.pos = this.pos.add(correction);
                from.pos = from.pos.sub(correction);
                distance = this.pos.distance(from.pos);
                isTouching = distance <= this.radius + from.radius;
                this.data.entropy += .001
            }
        }
        // affected by distance
        const newPos = this.pos.add(from.pos.sub(this.pos).norm().mul(1 / distance* distance));
        if (newPos.x == newPos.x && newPos.y == newPos.y) {
            this.pos = this.pos.add(from.pos.sub(this.pos).norm().mul(1 / distance * distance));
        }
        // Emitting particles representing the transfer
        this.particleSystem.emit(
            this.pos,
            from.pos.sub(this.pos).norm().mul(-2),  // Particle velocity coming from the other tripole
            6000,  // Lifetime of the particles
            'rgba(191, 200, 255, .3)'  // Bluish color for entropy particle
        );
    }
    calculate_entropy_rotation(addedEntropy) {
        const maxEntropyDegree = 180;
        let totalEntropy = this.data.entropy + addedEntropy;
        const a = 6 / maxEntropyDegree;
        const b = 4;
        let initialDegree = maxEntropyDegree - maxEntropyDegree / (1 + Math.exp(-a * (this.data.entropy - maxEntropyDegree * b / 100)));
        let finalDegree = maxEntropyDegree - maxEntropyDegree / (1 + Math.exp(-a * (totalEntropy - maxEntropyDegree * b / 100)));
        let entropyRotation = finalDegree - initialDegree;
        entropyRotation = Math.max(0, Math.min(entropyRotation, maxEntropyDegree));
        return entropyRotation;
    }

    emit_entropy(to, energy, entropy) {
        if (this === to || this.objects.includes(to)) return;

        const availableEnergy = Math.min(this.data.energy, energy);
        const availableEntropy = Math.min(this.data.entropy, entropy);
        const distance = this.pos.distance(to.pos);
        const impedance = this.impedance();
        const scale = 1 / (distance * impedance);
        this.data.energy -= availableEnergy * scale;
        this.data.entropy -= availableEntropy * scale;
        to.data.energy += availableEnergy * scale;
        to.data.entropy += availableEntropy * scale;
        to._entropic_degree = this.entropic_degree;
        
        // Emitting particles representing the transfer
        this.particleSystem.emit(
            this.pos,
            to.pos.sub(this.pos).norm().mul(-2),  // Particle velocity coming from the other tripole
            6000,  // Lifetime of the particles
            'rgba(0, 200, 0, .7)'  // Bluish color for entropy particle
        );
        return energy * scale;

    }

    // Should be called after updating the bounds of the parent tripole.
    scale_to_bounds() {
        const parentWorldSize = Math.sqrt(this.energy) * 4;
        const scale = parentWorldSize / Math.max(this.bounds.x, this.bounds.y, 1);
        for (let child of this.objects) {
            const relativePos = child.pos.sub(this.pos);
            const scaledPos = relativePos.mul(scale).add(this.pos);
            child.data.energy *= scale * scale;
            child.pos = scaledPos;
        }
    }

    // An absorption check which calls 'absorb' if another tripole is small enough.
    absorbPotentialChildren() {
        for (let i = this.objects.length - 1; i >= 0; i--) {
            let child = this.objects[i];
            if (this.energy > child.energy * 1.5 || Math.random() > 0.9) {
                this.absorb(child);
            }
        }
    }

    absorb(child) {
        const index = this.objects.indexOf(child);
        if (index !== -1) {
            this.objects.splice(index, 1);
            this.objects.push(...child.objects);
            child.clear(); // Clear the absorbed tripole's objects.
        }

        this.update_bounds(); // Update bounds and pos.
    }

    color() {
        const entropyRatio = this.data.entropy / this.getMaxEntropy(); // Relative entropy
        const energyRatio = this.data.energy / this.getMaxEnergy(); // Relative energy
        const hue = (1 - entropyRatio) * 360; // Inverse so higher entropy is cooler (toward blue)
        let lightness = 150 + (energyRatio - 0.6) * 30; // Energy affects lightness
        lightness = Math.min(100, Math.max(0, lightness)); // Clamp lightness between 0% and 100%
        const saturation = 256; // Full saturation for vivid colors
        return `hsla(${hue}, ${saturation}%, ${lightness}%,${lightness/1024})`;
    };

    getMaxEntropy() { return 100; };
    getMaxEnergy() { return 80; };
    powerInput(time) { return 1 + Math.sin(time / 10); };
    impedance() { return 0.75; };


    flowFunctionF(E_O, E_E, Z) {
        return (E_E - E_O) * (1 - Z);
    };

    flowFunctionG(E_O, E_E, Z) {
        return (E_O - E_E) * Z;
    };
}

class PopulationManager {
    constructor(environment) {
        this.environment = environment;
        this.generation = 0;
        this.evaluationInterval = 100; // Check the population every 100 frames.
        this.optimizeInterval = 500; // Introduce new tripoles every 1000 frames.
        this.frameCount = 0;
        this.population = 0;
        this.minimumPopulation = 500;
    }

    run() {
        this.frameCount++;
        this.population = this.environment.objects.length;
        if (this.frameCount % this.optimizeInterval === 0) {
            const selectedTripoles = this.selection();
            if (selectedTripoles.length > 1) { 
                this.optimize(selectedTripoles);
            }
        }
    }

    selection() {
        const selectionCutoff = 0.1;
        const sortedTripoles = this.environment.objects
                                .map(tripole => {
                                    tripole.calculateFitness();
                                    return tripole;
                                })
                                .sort((a, b) => b.fitness - a.fitness);
        const selectedCount = Math.floor(this.environment.objects.length * selectionCutoff);
        return sortedTripoles.slice(0, selectedCount);
    }
    
    // optimize tripole fitness by mutating and crossing over the selected tripole. the tripole is updated with the new genetics
    // and the historical genetics are saved along with the fitness. Every 1000 frames, the highest fitness tripole genetics are
    // kept and the rest are discarded.
    optimize(selectedTripoles) {
        if (this.frameCount % 100 === 0) {
            for (let i = 0; i < selectedTripoles.length; i++) {
                const parentA = selectedTripoles[i];
                for (let j = i + 1; j < selectedTripoles.length; j++) {
                    const parentB = selectedTripoles[j];
                    const child = Tripole.crossover(parentA, parentB)
                    parentA.historical_fitness.push({fitness: parentA.fitness, genetics: parentA.genetics});
                    parentB.historical_fitness.push({fitness: parentB.fitness, genetics: parentB.genetics});
                    parentA.genetics = child;
                    parentB.genetics = child;
                }
                parentA.mutate();
            }
            // every 1000 frames, keep the highest fitness tripole genetics and discard the rest

            const selectionCutoff = 0.1;
            const sortedTripoles = this.environment.objects
                                    .map(tripole => {
                                        tripole.calculateFitness();
                                        return tripole;
                                    })
                                    .sort((a, b) => b.fitness - a.fitness);
            const selectedCount = Math.floor(this.environment.objects.length * selectionCutoff);
            const _selectedTripoles = sortedTripoles.slice(0, selectedCount);
            for (let i = 0; i < _selectedTripoles.length; i++) {
                const parentA = _selectedTripoles[i];
                for (let j = i + 1; j < _selectedTripoles.length; j++) {
                    const parentB = _selectedTripoles[j];
                    const child = Tripole.crossover(parentA, parentB)
                    parentA.genetics = child;
                    parentB.genetics = child;
                }
                parentA.mutate();
            }
        }
        this.generation++;
    }
    runGeneration() {
        const selectedTripoles = this.selection();
        this.optimize(selectedTripoles);
    }
}

class Entropy extends Tripole {
    constructor(environment, pos, energy, entropy) {
        super('entropy', environment, pos, entropy);
        this.data.energy = energy;
    }
}

class WhiteHole extends Tripole {
    constructor(environment, pos, emissionRate) {
        super('white_hole', environment, pos);
        this.emissionRate = emissionRate; // Rate at which the white hole emits low-entropy energy
    }
    
    emitEnergy() {
        for (let object of this.environment.objects) {
            if (object !== this && object.energy / object.entropy > this.energy / this.entropy) {
                object.absorb_entropy(this, this.emissionRate);
                break;
            }
        }
    }
    
    update() {
        this.emitEnergy();
    }

    render(ctx) {
        ctx.beginPath();
        ctx.arc(this.pos.x, this.pos.y, 30, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
        ctx.stroke();
        ctx.closePath();

        const radialGradient = ctx.createRadialGradient(this.pos.x, this.pos.y, 0, this.pos.x, this.pos.y, 15);
        radialGradient.addColorStop(0, 'rgba(255, 255, 255, 1)');
        radialGradient.addColorStop(1, 'rgba(255, 255, 255, 0)');

        ctx.beginPath();
        ctx.arc(this.pos.x, this.pos.y, 15, 0, Math.PI * 2);
        ctx.fillStyle = radialGradient;
        ctx.fill();
        ctx.closePath();
    }
}

class BlackHole extends Tripole {
    constructor(environment, pos, attractionStrength) {
        super('black_hole', environment, pos);
        this.attractionStrength = attractionStrength; // Strength of attraction, intensity of absorbing high-entropy energy
    }
    
    attractEnergy() {
        for (let object of this.environment.objects) {
            if (object !== this && object.energy / object.entropy < this.energy / this.entropy) {
                this.absorb_entropy(object, this.attractionStrength);
            }
        }
    }
    
    update() {
        this.attractEnergy();
    }

    render(ctx) {
        // Draw the absorption field or gravitational pull area
        ctx.beginPath();
        ctx.arc(this.pos.x, this.pos.y, this.radius * 2, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.3)';
        ctx.stroke();
        ctx.closePath();

        // Draw the black hole itself
        const radialGradient = ctx.createRadialGradient(this.pos.x, this.pos.y, 0, this.pos.x, this.pos.y, this.radius);
        radialGradient.addColorStop(0, 'rgba(0, 0, 0, 1)');
        radialGradient.addColorStop(1, 'rgba(51, 51, 51, 0)');

        ctx.beginPath();
        ctx.arc(this.pos.x, this.pos.y, this.radius, 0, Math.PI * 2);
        ctx.fillStyle = radialGradient;
        ctx.fill();
        ctx.closePath();

        // draw a golden ring around the black hole
        ctx.beginPath();
        ctx.arc(this.pos.x, this.pos.y, this.radius + 2, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(255, 215, 0, 0.5)';
        ctx.stroke();
    }

}

class Environment extends Tripole {

    constructor(totalEnergy) {
        super('environment', null, null, null, null);
        this.totalEnergy = totalEnergy;
        this.data.energy = totalEnergy;
        this.data.entropy = 1;
    }


    render(ctx) {
        // draw a circle to represent the environment
        for (let object of this.objects) {
            object.render(ctx, this.energy, object.pos);
        }
        // whiteHole.render(ctx);
        // blackHole.render(ctx);
    }

    update() {
        // count total energy in the system
        this.data.energy = this.totalEnergy;
    }

    renderObjects(ctx, parentPosition, parentScale) {
        // this is done recursively
        for (let object of this.objects) {
            object.render(ctx, object.pos, parentScale);
        }
    }

    receiveEnergy(energyInput) {
        this.data.energy += energyInput;
        let propulsionStrength = energyInput; // Arbitrary example value
        this.velocity.x += propulsionStrength;
    };

    check_energy_balance() {
        const tripolesEnergy = this.objects.reduce((sum, obj) => sum + obj.energy, 0);
        const energyMismatch = this.totalEnergy - tripolesEnergy;
        console.log(`Energy Discrepancy: ${energyMismatch.toFixed(2)}`);
        if (energyMismatch !== 0) {
            console.error("Energy is not conserved in the system.");
        }
    }
}

class Particle {
    constructor(pos, velocity, lifetime, color) {
        this.pos = pos;
        this.velocity = velocity;
        this.lifetime = 30;
        this.color = color;
        this.alive = true;
    }

    update() {
        if (!this.alive) return;

        this.pos = this.pos.add(this.velocity);
        this.lifetime--;

        if (this.lifetime <= 0) {
            this.alive = false;
        }
    }

    render(ctx) {
        if (!this.alive) return;

        ctx.beginPath();
        ctx.arc(this.pos.x, this.pos.y, 1, 0, Math.PI * 2);
        ctx.fillStyle = this.color;
        ctx.fill();
    }
}

class ParticleSystem {
    constructor() {
        this.particles = [];
    }

    emit(pos, velocity, lifetime, color) {
        if(this.particles.length>50) return;
        this.particles.push(new Particle(pos, velocity, lifetime, color));
    }

    update() {
        this.particles = this.particles.filter(p => p.alive);
        this.particles.forEach(p => p.update());
    }

    render(ctx) {
        this.particles.forEach(p => p.render(ctx));
    }
}

function createTripole() {
    let tripole = new Tripole('bob', environment, new Vector(Math.random() * canvas.width * __scale, Math.random() * canvas.height * __scale));
    tripole.data.energy = 20
    tripole.data.entropy = .01
    tripole.sensor = new Tripole('sensor', tripole, tripole.pos);
    tripole.sensor.data.energy = 0
    tripole.sensor.data.entropy = .01
    tripole.actuator = new Tripole('actuator', tripole, tripole.pos);
    tripole.actuator.data.energy = 10
    tripole.actuator.data.entropy = .01
    tripole.data.energy = 10
    tripole.data.entropy = .1
    return tripole
}

const environment = new Environment(500);
environment.environment = environment;
let populationManager = new PopulationManager(environment);

const whiteHole = new WhiteHole(environment, new Vector(100, canvas.height / 2), 2.5);
const blackHole = new BlackHole(environment, new Vector(canvas.width - 100, canvas.height / 2), 2.5);

let tripoles = []
for (let i = 0; i < 400; i++) {
    tripoles.push(createTripole())
}

function calculateTotalSystemEnergy(environment) {
    return environment.energy
}

function handleTripoleInteractions() {
    for (let i = 0; i < environment.objects.length; i++) {
        let tripoleA = environment.objects[i];
        for (let j = i + 1; j < environment.objects.length; j++) {
            let tripoleB = environment.objects[j];
            if (tripoleA === tripoleB) continue;
            tripoleInteraction(tripoleA, tripoleB);
        }
    }
}

function tripoleInteraction(tripoleA, tripoleB) {
    // Calculate the distance between the two tripoles
    let distance = tripoleA.pos.distance(tripoleB.pos);

    // Check if the tripoles are touching
    let isTouching = distance < tripoleA.radius + tripoleB.radius;

    // Check if the tripoles are in the same environment
    let isInside = tripoleA.environment === tripoleB.environment;
    
    // If the tripoles are touching and in the same environment, repel them
    if (isTouching && isInside) {
        // Calculate the overlap distance
        const overlap = tripoleA.radius + tripoleB.radius - distance;

        // Calculate the direction of repulsion
        const direction = tripoleA.pos.sub(tripoleB.pos).norm();

        // Calculate the amount of correction to repel the tripoles
        let correction = direction.mul(overlap / 64);

        // Apply the correction to both tripoles
        tripoleA.pos = tripoleA.pos.add(correction);
        tripoleB.pos = tripoleB.pos.sub(correction);

        // Example elastic collision response assuming equal mass and a head-on collision
        let velocityA = tripoleA.velocity;
        let velocityB = tripoleB.velocity;

        tripoleA.velocity = velocityB; // For a simple elastic collision with equal mass
        tripoleB.velocity = velocityA; // Swap velocities

        // Now, slightly shift them apart based on collision depth to avoid sticking together
        correction = direction.mul(overlap / 2); // Use overlap to push apart by half the overlap distance for each
        tripoleA.pos = tripoleA.pos.add(correction);
        tripoleB.pos = tripoleB.pos.sub(correction);
       
        tripoleA.particleSystem.update();
        tripoleB.particleSystem.update();

        // Emit energy from the larger tripoles to the smaller one
        const _from = (tripoleA.energy / tripoleA.entropy) < (tripoleB.energy / tripoleB.entropy) ? tripoleA : tripoleB;
        const _to = (tripoleA.energy / tripoleA.entropy) < (tripoleB.energy / tripoleB.entropy) ? tripoleB : tripoleA;
        if (_from.energy > 0 ) _from.emit_entropy(_to, 0.0000000000001/distance, 0.0000000000001/distance * _from.energy / _from.entropy);
        else if (_to.energy > 0) _to.emit_entropy(_from, 0.0000000000002/distance, 0.0000000000002/distance * _to.energy / _to.entropy);
        else if (_from.energy > 0 && _to.energy > 0) _from.emit_entropy(_to, 0.0000000000001/distance, 0.0000000000001/distance * _from.energy / _from.entropy);

    } else if (distance < 120) {
        // Emit energy from the larger tripoles to the smaller one
        const _from = (tripoleA.energy / tripoleA.entropy) < (tripoleB.energy / tripoleB.entropy) ? tripoleA : tripoleB;
        const _to = (tripoleA.energy / tripoleA.entropy) < (tripoleB.energy / tripoleB.entropy) ? tripoleB : tripoleA;
        if (_from.energy > 0) _to.absorb_entropy(_from, .0000000000001/distance, .0000000000001/distance * _from.energy / _from.entropy);
        else if (_to.energy > 0) _from.absorb_entropy(_to, .0000000000002/distance, .0000000000002/distance * _to.energy / _to.entropy);
    }
}

function render() {
    ctx.fillStyle = 'rgba(0,0,0, .05)';
    ctx.fillRect(0, 0, ctx.canvas.width * __scale, ctx.canvas.height * __scale); // Clear the canvas for the new frame

    // Handle the physics and interactions for all tripoles
    handleTripoleInteractions();

    environment.update(); // Execute the update logic for the environment and each tripoles
    // whiteHole.update();b
    // blackHole.update();
    environment.render(ctx); // Render the updated state of the environment and tripoles


    populationManager.run();

    requestAnimationFrame(render); // Schedule the next frame
}
canvas.style.backgroundColor = '#00000000';
render();
ctx.scale(1/__scale,1/__scale)
