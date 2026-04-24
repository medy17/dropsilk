/**
 * aurora.js - WebGL fluid silk background for DropSilk
 * A high-performance domain-warping shader that simulates flowing silk/aurora waves
 * dynamically using the theme's primary and secondary colors.
 */

let gl;
let program;
let animationFrameId;
let canvas;
let isRunning = false;

const vertexShaderSource = `
    attribute vec2 position;
    void main() {
        gl_Position = vec4(position, 0.0, 1.0);
    }
`;

const fragmentShaderSource = `
    precision highp float;
    
    uniform vec2 u_resolution;
    uniform float u_time;
    uniform vec3 u_color_primary;
    uniform vec3 u_color_secondary;

    // Smooth random function
    float hash(vec2 p) {
        return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
    }

    // 2D Value Noise
    float noise(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        // Quintic hermite curve for smoother interpolation
        vec2 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
        return mix(
            mix(hash(i + vec2(0.0, 0.0)), hash(i + vec2(1.0, 0.0)), u.x),
            mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x),
            u.y
        );
    }

    // Fractional Brownian Motion
    float fbm(vec2 p) {
        float value = 0.0;
        float amp = 0.5;
        vec2 shift = vec2(100.0);
        // Rotate to reduce axial bias and make patterns more organic
        mat2 rot = mat2(cos(0.5), sin(0.5), -sin(0.5), cos(0.50));
        for (int i = 0; i < 5; i++) {
            value += amp * noise(p);
            p = rot * p * 2.0 + shift;
            amp *= 0.5;
        }
        return value;
    }

    void main() {
        // Normalized pixel coordinates (from 0 to 1)
        vec2 st = gl_FragCoord.xy / u_resolution.xy;
        // Aspect ratio correction to prevent stretching
        st.x *= u_resolution.x / u_resolution.y;

        // Scale the coordinate system
        st *= 1.2;

        // Domain warping base level
        vec2 q = vec2(0.0);
        q.x = fbm(st + 0.015 * u_time);
        q.y = fbm(st + vec2(1.0));

        // Domain warping second level (creates the swirling fluid look)
        vec2 r = vec2(0.0);
        r.x = fbm(st + 1.5 * q + vec2(1.7, 9.2) + 0.08 * u_time);
        r.y = fbm(st + 1.5 * q + vec2(8.3, 2.8) + 0.05 * u_time);

        // Final density field
        float f = fbm(st + 2.0 * r);

        // High-frequency color mixing ensures we always see both primary and secondary colors intertwining
        float rawMix = sin(r.x * 5.0 - u_time * 0.5) * 0.5 + 0.5;
        
        // SHARPEN the boundary significantly (0.45 to 0.55). 
        // Direct RGB mixing of opposite colors (cyan + pink) creates grey in the middle.
        // A sharper step means we see mostly pure Primary or pure Secondary, with almost zero muddy transition.
        float colorMix = smoothstep(0.45, 0.55, rawMix);
        vec3 color = mix(u_color_primary, u_color_secondary, colorMix);

        // OLED isolation (crush alpha to create deep, empty negative space)
        float alpha = smoothstep(0.35, 0.75, f);

        // Intense, SATURATED ridges
        float ridge = smoothstep(0.45, 0.65, f) * smoothstep(0.85, 0.65, f);
        
        // Multiply the EXISTING color by the ridge intensity. 
        // This ensures the highlight is pure cyan or pure pink, never white or grey.
        color += color * pow(ridge, 1.5) * 2.0;

        // Normalize color to prevent clipping to white. 
        // If a color channel exceeds 1.0, it turns white/washed out. Scaling it back down preserves perfect saturation.
        float maxCol = max(color.r, max(color.g, color.b));
        if (maxCol > 1.0) {
            color /= maxCol; 
        }

        // Overall Opacity & Vignette Shaping
        vec2 centerUv = gl_FragCoord.xy / u_resolution.xy;
        float distToCenter = length(centerUv - vec2(0.5));
        float vignette = smoothstep(1.1, 0.25, distToCenter);
        
        // Final OLED-style alpha
        alpha *= vignette;

        // BUGFIX: Removed 'color * alpha'. 
        // The WebGL blendFunc already multiplies by alpha. Doing it twice was squaring the alpha (e.g., 0.5 * 0.5 = 0.25),
        // which turned semi-transparent areas incredibly dark, creating the "grey smoke" effect over the dark background.
        gl_FragColor = vec4(color, alpha);
    }
`;

function createShader(gl, type, source) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        console.error('Shader compile error:', gl.getShaderInfoLog(shader));
        gl.deleteShader(shader);
        return null;
    }
    return shader;
}

function initProgram(gl) {
    const vs = createShader(gl, gl.VERTEX_SHADER, vertexShaderSource);
    const fs = createShader(gl, gl.FRAGMENT_SHADER, fragmentShaderSource);
    const prog = gl.createProgram();
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
        console.error('Program link error:', gl.getProgramInfoLog(prog));
        return null;
    }
    return prog;
}

let cachedColors = null;
let lastColorCheck = 0;

function getThemeColors() {
    const now = performance.now();
    // Re-check colors every 2 seconds to support theme switching seamlessly
    if (cachedColors && (now - lastColorCheck < 2000)) {
        return cachedColors;
    }
    
    if (!document.body) return { color1: [0.35, 0.8, 0.98], color2: [0.96, 0.66, 0.72] };
    
    const tempEl = document.createElement('div');
    tempEl.style.display = 'none';
    document.body.appendChild(tempEl);
    
    // Assigning to color lets the browser compute variables into rgb() strings
    tempEl.style.color = 'var(--c-primary)';
    const c1 = getComputedStyle(tempEl).color;
    
    tempEl.style.color = 'var(--c-secondary)';
    const c2 = getComputedStyle(tempEl).color;
    
    document.body.removeChild(tempEl);
    
    const parseRgb = (rgbStr, defaultCol) => {
        const match = String(rgbStr).match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
        if (match) {
            return [parseInt(match[1])/255, parseInt(match[2])/255, parseInt(match[3])/255];
        }
        return defaultCol;
    };
    
    cachedColors = {
        color1: parseRgb(c1, [0.35, 0.8, 0.98]),
        color2: parseRgb(c2, [0.96, 0.66, 0.72])
    };
    lastColorCheck = now;
    
    return cachedColors;
}

let cachedLocations = null;

function getUniformLocations() {
    if (cachedLocations) return cachedLocations;
    cachedLocations = {
        resolution: gl.getUniformLocation(program, 'u_resolution'),
        time: gl.getUniformLocation(program, 'u_time'),
        colorPrimary: gl.getUniformLocation(program, 'u_color_primary'),
        colorSecondary: gl.getUniformLocation(program, 'u_color_secondary')
    };
    return cachedLocations;
}

function resize() {
    if (!canvas) return;
    // Limit pixel ratio to max 2 for performance on high-DPI screens
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = window.innerWidth * dpr;
    canvas.height = window.innerHeight * dpr;
    gl.viewport(0, 0, canvas.width, canvas.height);
}

function render(time) {
    if (!isRunning) return;

    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(program);

    const locs = getUniformLocations();
    const colors = getThemeColors();

    gl.uniform2f(locs.resolution, canvas.width, canvas.height);
    // Pass time in seconds for the shader
    gl.uniform1f(locs.time, time * 0.001);
    gl.uniform3fv(locs.colorPrimary, colors.color1);
    gl.uniform3fv(locs.colorSecondary, colors.color2);

    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    animationFrameId = requestAnimationFrame(render);
}

export function initAurora() {
    canvas = document.getElementById('aurora-canvas');
    if (!canvas) return;

    gl = canvas.getContext('webgl', { alpha: true, antialias: false, premultipliedAlpha: false });
    if (!gl) {
        console.warn('WebGL not supported, falling back to CSS blobs (if available)');
        return;
    }

    // Use standard alpha blending
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    program = initProgram(gl);
    if (!program) return;

    const vertices = new Float32Array([
        -1, -1,
        1, -1,
        -1, 1,
        1, 1
    ]);

    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);

    const posAttrib = gl.getAttribLocation(program, 'position');
    gl.enableVertexAttribArray(posAttrib);
    gl.vertexAttribPointer(posAttrib, 2, gl.FLOAT, false, 0, 0);

    window.addEventListener('resize', resize);
    resize();
}

export function startAurora() {
    if (isRunning || !gl) return;
    isRunning = true;
    render(performance.now());
}

export function stopAurora() {
    isRunning = false;
    if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
    }
    if (gl) {
        gl.clear(gl.COLOR_BUFFER_BIT);
    }
}
