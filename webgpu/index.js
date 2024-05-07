// utils
const button = document.getElementById("btn-frame+");
const button2 = document.getElementById("btn-auto");

const GRID_SIZE = 16;
const gridShader = await fetch('/webgpu/grid.wgsl').then((v) => v.text());
const computeShader = await fetch('/webgpu/compute.wgsl').then((v) => v.text());
function log(msg) {
  document.getElementById("log").innerHTML += `<li>${(new Date()).toLocaleTimeString()}: ${msg}</li>`;
}

/**
 * Custom Renderer for WebGPU
 */
class Renderer {
  constructor() {
    this.device = null;
    this.canvasFormat = null;
    this.context = null;
    this.format = null;
    this.stepV = 0;
  }
  // helpers
  #vertexBuffer = null;
  #gridPipeline = null;
  #simPipeline = null;
  #bindGroups = [];
  /**
   * Initializes WebGPU API
   * @returns {Promise<boolean>}
   */
  async init() {
    // test webgpu compatibility
    if (!navigator.gpu) {
      log("ERR: WebGPU not supported on this browser");
      return false;
    }
    // attach to gpu
    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) {
      log("ERR: No GPUAdapter found");
      return false;
    }
    const device = await adapter.requestDevice();
    // configure canvas
    const context = document.getElementById("canvas")?.getContext("webgpu");
    if (!context) {
      log("ERR: Could not get canvas context");
      return false;
    }
    const format = navigator.gpu.getPreferredCanvasFormat();
    context.configure({ device, format });
    // confirm initialization
    this.device = device;
    this.context = context;
    this.format = format;

    return true;
  }
  /**
   * Converts RGBA to vec4f format
   * @param {Number} r 
   * @param {Number} g 
   * @param {Number} b 
   * @param {Number | undefined} a 
   * @returns {Float32Array}
   */
  colorRGBA(r, g, b, a) {
    const color = new Float32Array(4);
    color[0] = r ? Math.floor(r)/255 : 0;
    color[1] = g ? Math.floor(g)/255 : 0;
    color[2] = b ? Math.floor(b)/255 : 0;
    color[3] = a ? Math.floor(a)/255 : 1;
    return color;
  }
  step() {
    this.stepV++;
  }
  drawRect() {
    // write vertex buffer
    const offsetX = Math.random() - 0.5;
    const offsetY = Math.random() - 0.5;
    const scale = 0.2;
    const vertices = new Float32Array([
      // x, y
      offsetX-scale, offsetY+scale, 
      offsetX+scale, offsetY+scale,
      offsetX+scale, offsetY-scale,

      offsetX-scale, offsetY+scale,
      offsetX-scale, offsetY-scale,
      offsetX+scale, offsetY-scale,
    ]);
    const vertexBuffer = this.device.createBuffer({
      label: "rect-vertices",
      size: vertices.byteLength,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });
    this.device.queue.writeBuffer(vertexBuffer, 0, vertices);
    // define layout
    const vertexBufferLayout = {
      arrayStride: 8,
      attributes: [{
        format: "float32x2",
        offset: 0,
        shaderLocation: 0,
      }]
    }
    // configure shaders
    const shaderModule = this.device.createShaderModule({
      label: "rect-shader",
      code: `
        @vertex
        fn vertexMain(@location(0) pos: vec2f) -> @builtin(position) vec4f {
          return vec4f(pos, 0, 1);
        }

        @fragment
        fn fragmentMain() -> @location(0) vec4f {
          return vec4f(1, 0, 0, 1);
        }
      `,
    })
    const pipeline = this.device.createRenderPipeline({
      label: "rect-pipeline",
      layout: "auto",
      vertex: {
        module: shaderModule,
        entryPoint: "vertexMain",
        buffers: [vertexBufferLayout]
      },
      fragment: {
        module: shaderModule,
        entryPoint: "fragmentMain",
        targets: [{ format: this.format }]
      }
    });
    // draw to screen
    const encoder = this.device.createCommandEncoder();
    const pass = encoder.beginRenderPass({
      colorAttachments: [{
        view: this.context.getCurrentTexture().createView(),
        clearValue: { r:0, g:0.1, b:0.2, a:1 },
        loadOp: "clear",
        storeOp: "store",
      }]
    });
    pass.setPipeline(pipeline);
    pass.setVertexBuffer(0, vertexBuffer);
    pass.draw(vertices.length / 2);
    pass.end();
    const commandBuffer = encoder.finish();
    this.device.queue.submit([commandBuffer]);
    log(`Drew square at (${offsetX.toFixed(3)}, ${offsetY.toFixed(3)}) of size ${scale}`);
  }
  initGrid(color) {
    // write vertex buffer
    const vertices = new Float32Array([
      -0.8, 0.8, 0.8, 0.8, 0.8, -0.8, // ABC
      -0.8, 0.8, -0.8, -0.8, 0.8, -0.8, // ADC
    ]);
    this.#vertexBuffer = this.device.createBuffer({
      label: "rect-vertices",
      size: vertices.byteLength,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });
    this.device.queue.writeBuffer(this.#vertexBuffer, 0, vertices);
    // define layout
    const vertexBufferLayout = {
      arrayStride: 8,
      attributes: [{
        format: "float32x2",
        offset: 0,
        shaderLocation: 0,
      }]
    }
    // create uniforms
    const uniformArray = new Float32Array([GRID_SIZE, GRID_SIZE]);
    const uniformBuffer = this.device.createBuffer({
      label: "grid-uniform-size",
      size: uniformArray.byteLength,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    this.device.queue.writeBuffer(uniformBuffer, 0, uniformArray);
    const colorBuffer = this.device.createBuffer({
      label: "grid-uniform-color",
      size: color?.byteLength || 16,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    })
    if (color) this.device.queue.writeBuffer(colorBuffer, 0, color);
    // create simulation shader
    const simulationShaderModule = this.device.createShaderModule({
      label: "grid-simul",
      code: computeShader
    });
    // create bind group layout
    const bindGroupLayout = this.device.createBindGroupLayout({
      label: "grid-bind-group-layout",
      entries: [{
        binding: 0,
        visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT | GPUShaderStage.COMPUTE,
        buffer: {}
      }, {
        binding: 1,
        visibility: GPUShaderStage.VERTEX | GPUShaderStage.COMPUTE,
        buffer: { type: "read-only-storage" },
      }, {
        binding: 2,
        visibility: GPUShaderStage.COMPUTE,
        buffer: { type: "storage" },
      }, {
        binding: 3,
        visibility: GPUShaderStage.FRAGMENT,
        buffer: {}
      }]
    });
    const pipelineLayout = this.device.createPipelineLayout({
      label: "grid-pipeline-layout",
      bindGroupLayouts: [bindGroupLayout]
    });

    // create storage buffer
    let cellStateArray = new Uint32Array(GRID_SIZE * GRID_SIZE);
    const cellStateStorage = [
      this.device.createBuffer({
        label: "cell-state-A",
        size: cellStateArray.byteLength,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
      }),
      this.device.createBuffer({
        label: "cell-state-B",
        size: cellStateArray.byteLength,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
      }),
    ];
    // randomly populate forward buffer
    for (let i=0; i < cellStateArray.length; i++) {
      cellStateArray[i] = Math.random() > 0.6 ? 1 : 0;
    }
    this.device.queue.writeBuffer(cellStateStorage[0], 0, cellStateArray);
    // configure shaders
    const shaderModule = this.device.createShaderModule({
      label: "grid-shader",
      code: gridShader,
    })
    this.#gridPipeline = this.device.createRenderPipeline({
      label: "grid-pipeline",
      layout: pipelineLayout,
      vertex: {
        module: shaderModule,
        entryPoint: "vertexMain",
        buffers: [vertexBufferLayout]
      },
      fragment: {
        module: shaderModule,
        entryPoint: "fragmentMain",
        targets: [{ format: this.format }]
      }
    });
    this.#simPipeline = this.device.createComputePipeline({
      label: "grid-sim-pipeline",
      layout: pipelineLayout,
      compute: {
        module: simulationShaderModule,
        entryPoint: "computeMain",
      }
    });
    this.#bindGroups = [
      this.device.createBindGroup({
        label: "grid-bind-group-A",
        layout: bindGroupLayout,
        entries: [{
          binding: 0,
          resource: { buffer: uniformBuffer }
        }, {
          binding: 1,
          resource: { buffer: cellStateStorage[0] }
        }, {
          binding: 2,
          resource: { buffer: cellStateStorage[1] }
        }, {
          binding: 3,
          resource: { buffer: colorBuffer }
        }]
      }),
      this.device.createBindGroup({
        label: "grid-bind-group-B",
        layout: bindGroupLayout,
        entries: [{
          binding: 0,
          resource: { buffer: uniformBuffer }
        }, {
          binding: 1,
          resource: { buffer: cellStateStorage[1] }
        }, {
          binding: 2,
          resource: { buffer: cellStateStorage[0] }
        }, {
          binding: 3,
          resource: { buffer: colorBuffer }
        }]
      }),
    ];
    log("Created grid");
  }
  updateGrid() {
    const encoder = this.device.createCommandEncoder();
    // compute updates
    const computePass = encoder.beginComputePass();
    computePass.setPipeline(this.#simPipeline);
    computePass.setBindGroup(0, this.#bindGroups[this.stepV%2]);
    const workgroupCount = Math.ceil(GRID_SIZE / 8);
    computePass.dispatchWorkgroups(workgroupCount, workgroupCount);
    computePass.end();
    // draw to screen
    const pass = encoder.beginRenderPass({
      colorAttachments: [{
        view: this.context.getCurrentTexture().createView(),
        clearValue: { r:0, g:0.1, b:0.2, a:1 },
        loadOp: "clear",
        storeOp: "store",
      }]
    });
    pass.setPipeline(this.#gridPipeline);
    pass.setVertexBuffer(0, this.#vertexBuffer);
    pass.setBindGroup(0, this.#bindGroups[this.stepV % 2]);
    pass.draw(6, GRID_SIZE * GRID_SIZE);
    pass.end();
    const commandBuffer = encoder.finish();
    this.device.queue.submit([commandBuffer]);
    log(`Drew new step (${this.stepV})`);
  }
}

log("Script Attached");
const renderer = new Renderer;
let loop = false;
let loopEvent = null;
const ready = await renderer.init();
if (ready) {
  const color = renderer.colorRGBA(200, 20, 100);
  renderer.initGrid(color);
}

function nextFrame() {
  if (ready) {
    renderer.updateGrid();
    renderer.step();
  }
}

button.addEventListener("click", nextFrame);
button2.addEventListener("click", () => {
  if (!loop) {
    log("Starting loop");
    loopEvent = window.setInterval(nextFrame, 500);
    loop = true;
  } else {
    window.clearInterval(loopEvent);
    loop = false;
    log("Ended loop");
  }
})
