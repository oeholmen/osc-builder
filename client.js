let synthParameters;
let synthParameterIndex;
let socketId;
let refreshHidden;
const socket = io();
const urlParams = new URLSearchParams(window.location.search);
const heading = document.getElementById('heading');
const form = document.getElementById('form');
const patchWrapper = document.getElementById('patchWrapper');
const patchForm = document.getElementById('patch');
const statusElement = document.getElementById('status');
const canvasElement = document.getElementById('canvas');
const adminStatus = document.getElementById('admin-status');
const refresh = document.getElementById('refresh');
const patchStatus = document.getElementById('patchStatus');
let isAdmin = typeof urlParams.get('admin') === 'string';

console.log('Start isAdmin', isAdmin);

patchForm.addEventListener('submit', function (e) {
    e.preventDefault();
    e.stopPropagation();
    patchStatus.classList.remove('hidden');
    const prompt = document.getElementById('prompt');
    createPatch(prompt.value);
});

socket.on('startCreating', function (prompt) {
    patchStatus.innerText = "Please wait, creating patch. Prompt given: " + prompt;
});

socket.on('patchCreated', function (message) {
    patchStatus.innerText = message;
});

const requestUpdate = () => {
    refreshHidden = isAdmin === false;
    return socket.emit('requestUpdate', socketId);
}

const createPatch = (prompt) => {
    return socket.emit('createPatch', prompt);
}

const createSliderWidget = (program, i) => {
    const inputElement = document.createElement("input");
    inputElement.setAttribute("type", "range");
    inputElement.setAttribute("min", program.min);
    inputElement.setAttribute("max", program.max);
    inputElement.setAttribute("step", program.step);
    inputElement.value = program.value;
    inputElement.addEventListener('input', function (e) {
        setAndSendValue(e.target.value, i);
    });
    return inputElement;
}

const createPushButtonWidget = (program, i) => {
    const buttonElement = document.createElement("button");
    buttonElement.innerText = program.push;
    buttonElement.value = program.value;
    buttonElement.classList.add('btn-push');
    buttonElement.classList.add('navy');
    buttonElement.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
    });
    const listenEvents = ["touchstart", "touchend", "mousedown", "mouseup"];
    listenEvents.forEach(listenEvent => {
        buttonElement.addEventListener(listenEvent, function (e) {
            e.preventDefault();
            e.stopPropagation();
            let value;
            let isOn;
            if (listenEvent === "touchstart" || listenEvent === "mousedown") {
                buttonElement.classList.add('active');
                value = program.max;
                isOn = true;
            } else {
                buttonElement.classList.remove('active');
                value = program.min;
                isOn = false;
            }
            setAndSendValue(value, i, isOn);
        });
    })
    return buttonElement;
}

const createButtonWidget = (program, i) => {
    if (typeof program.push === "string") {
        return createPushButtonWidget(program, i);
    }
    const buttonElement = document.createElement("button");
    buttonElement.innerText = program.value === program.max ? "On" : "Off";
    buttonElement.value = program.value;
    if (program.value === program.max) {
        buttonElement.classList.add('active');
    }
    buttonElement.classList.add('on-off-button');
    buttonElement.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        const value = parseInt(e.target.value) === program.max ? program.min : program.max;
        //updateButtonToReflectState(e.target, program, value);
        const isOn = value === program.max;
        setAndSendValue(value, i, isOn);
    });
    return buttonElement;
}

const createSelectWidget = (program, i) => {
    const selectElement = document.createElement("select");
    if (Array.isArray(program.valueMap)) {
        for (let j = program.min; j < program.valueMap.length + program.min; j++) {
            const optionElement = document.createElement("option");
            optionElement.textContent = getDisplayValue(j, i);
            optionElement.value = j;
            optionElement.selected = parseInt(program.value) === j;
            selectElement.appendChild(optionElement);
        }
    } else {
        for (const key in program.valueMap) {
            const optionElement = document.createElement("option");
            optionElement.textContent = program.valueMap[key];
            optionElement.value = key;
            optionElement.selected = program.value === key || parseInt(program.value) === parseInt(key);
            selectElement.appendChild(optionElement);
        }
    }
    selectElement.addEventListener('change', function (e) {
        setAndSendValue(e.target.value, i);
    });
    return selectElement;
}

const createButtonsWidget = (program, i) => {
    const wrapperElement = document.createElement("div");
    const innerWrapperElement = document.createElement("div");
    wrapperElement.classList.add("button-wrapper");
    innerWrapperElement.classList.add("button-inner-wrapper");
    if (Array.isArray(program.valueMap)) {
        for (let j = program.min; j < program.valueMap.length + program.min; j++) {
            const buttonElement = document.createElement("button");
            buttonElement.classList.add("toggle-button");
            buttonElement.innerHTML = getDisplayValue(j, i);
            buttonElement.value = j;
            if (parseInt(program.value) === j) {
                buttonElement.classList.add("active");
            }
            buttonElement.addEventListener('click', function (e) {
                e.preventDefault();
                e.stopPropagation();
                //updateButtonsToReflectState(wrapperElement, e.target.value);
                setAndSendValue(e.target.value, i);
            });
            innerWrapperElement.appendChild(buttonElement);
        }
    } else {
        for (const key in program.valueMap) {
            const buttonElement = document.createElement("button");
            buttonElement.classList.add("toggle-button");
            buttonElement.innerHTML = program.valueMap[key];
            buttonElement.value = key;
            if (program.value === key || parseInt(program.value) === parseInt(key)) {
                buttonElement.classList.add("active");
            }
            buttonElement.addEventListener('click', function (e) {
                e.preventDefault();
                e.stopPropagation();
                //updateButtonsToReflectState(wrapperElement, e.target.value);
                setAndSendValue(e.target.value, i);
            });
            innerWrapperElement.appendChild(buttonElement);
        }
    }
    wrapperElement.appendChild(innerWrapperElement);
    return wrapperElement;
}

const getElm = (elmType, i) => {
    return document.getElementById(elmType + '-' + i);
}

const getDisplayValue = (value, i) => {
    if (isNaN(value) || typeof synthParameters[i].valueMap !== "object") {
        return value;
    }
    let index = parseInt(value) - parseInt(synthParameters[i].min);
    return synthParameters[i].valueMap[index] || value;
}

const setAndSendValue = (value, i, isOn) => {
    synthParameters[i].value = value;
    getElm('value', i).innerText = value;
    if (typeof synthParameters[i].setBefore === "object" && (isOn === true || typeof isOn === "undefined")) {
        synthParameters[i].setBefore.forEach(parameter => setTimeout(() => { socket.emit('message', parameter); }, (parameter.delay || 0)));
    }
    socket.emit('message', synthParameters[i], i);
    if (typeof synthParameters[i].setAfter === "object" && (isOn === false || typeof isOn === "undefined")) {
        synthParameters[i].setAfter.forEach(parameter => setTimeout(() => { socket.emit('message', parameter); }, (parameter.delay || 0)));
    }
}

const updateButtonsToReflectState = (elm, value) => {
    elm.querySelectorAll('.toggle-button').forEach(function(btn) {
        if (value === parseInt(btn.value)) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });
}

const updateButtonToReflectState = (elm, program, value) => {
    if (value === program.max) {
        elm.innerText = "On";
        elm.classList.add('active');
    } else {
        elm.innerText = "Off";
        elm.classList.remove('active');
    }
}

const updatePushButtonToReflectState = (elm, program, value) => {
    if (value === program.max) {
        elm.classList.add('active');
    } else {
        elm.classList.remove('active');
    }
}

const hideFormInputs = (message) => {
    if (isAdmin) {
        return;
    }
    heading.innerText = '' // Clear heading
    form.innerHTML = ''; // Clear form
    statusElement.innerHTML = message;
    statusElement.classList.remove('hidden');
    canvasElement.classList.remove('hidden');
    refresh.classList.add('hidden');
}

const setFormInputs = (name, parameters, assignedControls, assignedParams, hideLabel) => {
    canvasElement.classList.add('hidden');
    heading.innerText = name; // Set heading
    form.innerHTML = ''; // Clear form
    synthParameters = parameters;
    synthParameterIndex = [];
    // Find assigned parameters
    for (let i = 0; i < synthParameters.length; i++) {
        if (synthParameters[i].sid === socketId) {
            synthParameterIndex.push(i);
        }
    }
    if (!isAdmin && (synthParameterIndex.length > 0 || assignedControls === false)) {
        statusElement.innerText = '';
        statusElement.classList.add('hidden');
    }
    for (let i = 0; i < synthParameters.length; i++) {
        const program = synthParameters[i];
        const wrapper = document.createElement("div");
        wrapper.classList.add('wrapper');
        wrapper.setAttribute("id", "wrapper-" + i);
        const valueElement = document.createElement("span");
        valueElement.classList.add('value');
        valueElement.innerText = program.value;
        valueElement.setAttribute("id", "value-" + i);
        const nameElement = document.createElement("div");
        nameElement.classList.add('name');
        nameElement.innerText = program.name;
        nameElement.appendChild(valueElement);
        if (hideLabel) {
            nameElement.classList.add('hidden');
        }
        if (program.description) {
            wrapper.title = program.description;
        }
        let argElement;
        if (typeof program.valueMap === "object") {
            if (program.type === "buttons") {
                argElement = createButtonsWidget(program, i);
            } else {
                argElement = createSelectWidget(program, i);
            }
        } else if (program.format === "b") {
            argElement = createButtonWidget(program, i);
        } else {
            argElement = createSliderWidget(program, i);
        }
        argElement.classList.add('arg');
        argElement.setAttribute("id", "arg-" + i);
        if (assignedControls === true && !synthParameterIndex.includes(i)) {
            argElement.disabled = isAdmin === false;
        }
        wrapper.appendChild(nameElement);
        wrapper.appendChild(argElement);
        if (assignedParams === true && !synthParameterIndex.includes(i)) {
            wrapper.classList.add('hidden');
        }
        if (assignedControls === true && assignedParams === false && synthParameterIndex.includes(i)) {
            wrapper.classList.add('selected');
        }
        form.appendChild(wrapper);
    }
    if (refreshHidden !== true && (assignedControls === true || assignedParams === true)) {
        refresh.classList.remove('hidden');
    } else {
        refresh.classList.add('hidden');
    }
    /* if (assignedControls === true) {
        patchWrapper.classList.add('hidden');
    } else {
        patchWrapper.classList.remove('hidden');
    } */
}

socket.on('setParameters', setFormInputs);
socket.on('hideParameters', hideFormInputs);

socket.on('socketId', function (sid) {
    socketId = sid;
});

socket.on('status', function (text) {
    console.log('status isAdmin', isAdmin);
    if (isAdmin) {
        return;
    }
    statusElement.innerHTML = text;
    statusElement.classList.remove('hidden');
});

socket.on('isAdmin', function (adminFlag) {
    isAdmin = !!adminFlag;
    console.log('adminFlag', isAdmin);
});

socket.on('adminSetup', function (settings) {
    console.log('adminSetup isAdmin', isAdmin);
    if (isAdmin === false) {
        return;
    }

    adminStatus.innerHTML = '<div>Clients: ' + settings.clients + '/' + settings.maxClients + '</div>';

    const messageElement = document.createElement("div");
    messageElement.classList.add('admin-status-message');
    messageElement.classList.add((settings.paramsActivated ? 'active' : 'inactive'));
    messageElement.innerText = settings.paramsActivated ? "Running" : "Stopped";
    const buttonWrapperElement = document.createElement("div");
    buttonWrapperElement.classList.add('start-stop-button-wrapper');
    const buttonElement = document.createElement("button");
    buttonElement.innerText = settings.paramsActivated ? "Stop" : "Start";
    buttonElement.classList.add('start-stop-button');
    buttonElement.value = settings.paramsActivated ? 0 : 1;
    buttonElement.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        return socket.emit('requestUpdate', socketId);
    });
    buttonWrapperElement.appendChild(buttonElement);
    adminStatus.appendChild(buttonWrapperElement);
    adminStatus.appendChild(messageElement);
    adminStatus.classList.remove('hidden');
});

socket.on('value', function (parameterIndex, value) {
    synthParameters[parameterIndex].value = value;
    const arg = getElm('arg', parameterIndex);
    arg.value = value;
    if (arg.classList.contains("on-off-button")) {
        updateButtonToReflectState(arg, synthParameters[parameterIndex], value);
    } else if (arg.classList.contains("button-wrapper")) {
        updateButtonsToReflectState(arg, value);
    } else if (synthParameters[parameterIndex].push === true) {
        updatePushButtonToReflectState(arg, synthParameters[parameterIndex], value);
    }
    getElm('value', parameterIndex).innerText = value;
});

socket.on('connect', function () {
    socket.emit('ready', isAdmin);
});
