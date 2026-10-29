// Three.js as modules, exposed as the global THREE that the rest of the Ark's files use
// (they are written as plain IIFEs and share the global Ark). The loader and the room environment come from the add-ons.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
window.THREE = Object.assign({}, THREE, { GLTFLoader, RoomEnvironment });
