import { Color, WebGLRenderer, SRGBColorSpace } from 'three';
import { palette } from './palette';

export interface Renderer {
  resize(width: number, height: number): void;
}

export function createRenderer(canvas: HTMLCanvasElement): Renderer {
  const gl = new WebGLRenderer({ canvas, antialias: true });
  gl.outputColorSpace = SRGBColorSpace;
  gl.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  gl.setClearColor(new Color(palette.environment['sky-day'].horizon));
  return {
    resize(width, height) {
      gl.setSize(width, height, false);
      gl.clear();
    },
  };
}
