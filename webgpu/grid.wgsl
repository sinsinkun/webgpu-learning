@group(0) @binding(0) var<uniform> grid: vec2f;
@group(0) @binding(3) var<uniform> color: vec4f;
@group(0) @binding(1) var<storage> cellState: array<u32>;

struct VertIn {
  @location(0) pos: vec2f, 
  @builtin(instance_index) instance: u32,
}

struct VertOut {
  @builtin(position) pos: vec4f,
  @location(0) cell: vec2f,
  @location(1) fpos: vec4f,
}

@vertex
fn vertexMain(input: VertIn) -> VertOut {

  let i = f32(input.instance); // convert unsigned int to float
  let state = f32(cellState[input.instance]);
  let cell = vec2f(i % grid.x, floor(i / grid.x));
  let cellOffset = cell / grid * 2.0;
  var gridPos = (input.pos * state + 1.0) / grid - vec2f(1.0) + cellOffset;

  // build output struct
  var output: VertOut;
  output.pos = vec4f(gridPos, 0.0, 1.0);
  output.fpos = vec4f(gridPos, 0.0, 1.0);
  output.cell = cell;
  return output;
}

@fragment
fn fragmentMain(@location(0) cell: vec2f, @location(1) fpos: vec4f) -> @location(0) vec4f {
  let c = cell/grid;
  var gradient = vec4f(c, 1.0-c.x, 1.0);
  if (color.a > 0.1) {
    gradient = gradient * 0.6 + color * 0.4;
  }
  return gradient;
}
