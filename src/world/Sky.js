import * as THREE from 'three';

// Gradient sky dome plus a star field. Both are driven by TimeOfDay: the
// gradient colors lerp per mode and the stars fade in at night.
// The dome is a large inverted sphere with a two-color vertical gradient —
// cheaper and more controllable than a cube texture.

const STAR_COUNT = 1400;
const DOME_RADIUS = 480;

export class Sky {
  constructor() {
    this.group = new THREE.Group();

    this.domeMaterial = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: {
        uTop: { value: new THREE.Color(0x5aa0f0) },
        uBottom: { value: new THREE.Color(0xbfe0ff) },
      },
      vertexShader: /* glsl */ `
        varying float vHeight;
        void main() {
          vec4 worldPos = modelMatrix * vec4(position, 1.0);
          vHeight = normalize(worldPos.xyz).y;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform vec3 uTop;
        uniform vec3 uBottom;
        varying float vHeight;
        void main() {
          // Compress the blend toward the horizon so the gradient reads well.
          float t = smoothstep(-0.05, 0.55, vHeight);
          gl_FragColor = vec4(mix(uBottom, uTop, t), 1.0);
        }
      `,
    });

    this.dome = new THREE.Mesh(
      new THREE.SphereGeometry(DOME_RADIUS, 32, 20),
      this.domeMaterial
    );
    this.group.add(this.dome);

    this._buildStars();
  }

  _buildStars() {
    const positions = new Float32Array(STAR_COUNT * 3);
    const sizes = new Float32Array(STAR_COUNT);

    for (let i = 0; i < STAR_COUNT; i++) {
      // Upper hemisphere only; nothing below the horizon is ever visible.
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(Math.random() * 0.95 + 0.05);
      const r = DOME_RADIUS * 0.92;
      positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = r * Math.cos(phi);
      positions[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
      sizes[i] = 1 + Math.random() * 2.4;
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));

    this.starMaterial = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      fog: false,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uOpacity: { value: 0 },
        uTime: { value: 0 },
      },
      vertexShader: /* glsl */ `
        attribute float aSize;
        varying float vTwinkle;
        uniform float uTime;
        void main() {
          // Per-star phase from position so twinkling is uncorrelated.
          vTwinkle = 0.65 + 0.35 * sin(uTime * 1.5 + position.x * 0.05 + position.z * 0.03);
          vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = aSize;
          gl_Position = projectionMatrix * mvPosition;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform float uOpacity;
        varying float vTwinkle;
        void main() {
          float d = length(gl_PointCoord - vec2(0.5));
          float alpha = smoothstep(0.5, 0.1, d) * uOpacity * vTwinkle;
          gl_FragColor = vec4(vec3(1.0, 0.98, 0.92), alpha);
        }
      `,
    });

    this.stars = new THREE.Points(geometry, this.starMaterial);
    this.stars.frustumCulled = false;
    this.group.add(this.stars);
  }

  // Keep the dome centered on the camera so it never gets "reached".
  update(dt, elapsed, cameraPosition) {
    this.group.position.copy(cameraPosition);
    this.starMaterial.uniforms.uTime.value = elapsed;
  }

  applyMode({ skyTop, skyBottom, starOpacity }) {
    this.domeMaterial.uniforms.uTop.value.copy(skyTop);
    this.domeMaterial.uniforms.uBottom.value.copy(skyBottom);
    this.starMaterial.uniforms.uOpacity.value = starOpacity;
    this.stars.visible = starOpacity > 0.01;
  }

  addTo(scene) {
    scene.add(this.group);
  }
}
