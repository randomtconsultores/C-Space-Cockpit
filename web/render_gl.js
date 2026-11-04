/* WebGL renderer: projects view-space lines and points produced by the C core.
   It knows nothing about game rules. */
(function (root) {
  "use strict";
  var VS_LINE = "attribute vec3 aPos; attribute float aCol; uniform float uF; uniform float uAsp;\n" +
    "varying float vCol; varying float vFade;\n" +
    "void main(){ vCol=aCol; vFade=clamp(1.15-aPos.z/4200.0,0.18,1.0);\n" +
    "gl_Position=vec4(aPos.x*uF/uAsp, aPos.y*uF, 0.0, aPos.z); }";
  var FS_LINE = "precision mediump float; varying float vCol; varying float vFade;\n" +
    "void main(){ vec3 c=vec3(0.35,1.0,0.45);\n" +
    "if(vCol>0.5&&vCol<1.5) c=vec3(0.12,0.45,0.2);\n" +
    "else if(vCol>1.5&&vCol<2.5) c=vec3(1.0,0.69,0.0);\n" +
    "else if(vCol>2.5&&vCol<3.5) c=vec3(1.0,0.35,0.3);\n" +
    "else if(vCol>3.5) c=vec3(0.3,0.85,1.0);\n" +
    "gl_FragColor=vec4(c*vFade,1.0); }";
  var VS_PT = "attribute vec4 aPos; uniform float uF; uniform float uAsp; uniform float uPx; varying float vB;\n" +
    "void main(){ vB=aPos.w; gl_PointSize=uPx*(0.8+aPos.w);\n" +
    "gl_Position=vec4(aPos.x*uF/uAsp, aPos.y*uF, 0.0, aPos.z); }";
  var FS_PT = "precision mediump float; varying float vB;\n" +
    "void main(){ gl_FragColor=vec4(vec3(0.75,1.0,0.8)*vB,1.0); }";

  function compile(gl, type, src) {
    var s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error("shader: " + gl.getShaderInfoLog(s));
    return s;
  }
  function program(gl, vs, fs) {
    var p = gl.createProgram();
    gl.attachShader(p, compile(gl, gl.VERTEX_SHADER, vs));
    gl.attachShader(p, compile(gl, gl.FRAGMENT_SHADER, fs));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error("link: " + gl.getProgramInfoLog(p));
    return p;
  }

  function Renderer(canvas, fovDegrees) {
    var gl = canvas.getContext("webgl", { antialias: true, alpha: false });
    if (!gl) throw new Error("WebGL indisponível");
    this.gl = gl; this.canvas = canvas;
    this.f = 1 / Math.tan((fovDegrees || 70) * Math.PI / 360);
    this.line = program(gl, VS_LINE, FS_LINE);
    this.pt = program(gl, VS_PT, FS_PT);
    this.lineBuf = gl.createBuffer(); this.ptBuf = gl.createBuffer();
    this.scratch = new Float32Array(4 * 2 * 3200);
  }
  Renderer.prototype.resize = function (w, h, dpr) {
    this.canvas.width = Math.floor(w * dpr); this.canvas.height = Math.floor(h * dpr);
    this.dpr = dpr; this.gl.viewport(0, 0, this.canvas.width, this.canvas.height);
  };
  /* seg: Float32Array view (stride 7), pts: Float32Array view (stride 4) */
  Renderer.prototype.draw = function (seg, segCount, pts, ptCount) {
    var gl = this.gl, asp = this.canvas.width / this.canvas.height;
    gl.clearColor(0.0, 0.015, 0.02, 1); gl.clear(gl.COLOR_BUFFER_BIT);
    gl.disable(gl.DEPTH_TEST); gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE);

    gl.useProgram(this.pt);
    gl.uniform1f(gl.getUniformLocation(this.pt, "uF"), this.f);
    gl.uniform1f(gl.getUniformLocation(this.pt, "uAsp"), asp);
    gl.uniform1f(gl.getUniformLocation(this.pt, "uPx"), 1.5 * (this.dpr || 1));
    gl.bindBuffer(gl.ARRAY_BUFFER, this.ptBuf);
    gl.bufferData(gl.ARRAY_BUFFER, pts.subarray(0, ptCount * 4), gl.DYNAMIC_DRAW);
    var ap = gl.getAttribLocation(this.pt, "aPos");
    gl.enableVertexAttribArray(ap); gl.vertexAttribPointer(ap, 4, gl.FLOAT, false, 16, 0);
    gl.drawArrays(gl.POINTS, 0, ptCount);

    var n = Math.min(segCount, 3200), o = this.scratch, k = 0;
    for (var i = 0; i < n; i++) {
      var b = i * 7;
      o[k++] = seg[b]; o[k++] = seg[b + 1]; o[k++] = seg[b + 2]; o[k++] = seg[b + 6];
      o[k++] = seg[b + 3]; o[k++] = seg[b + 4]; o[k++] = seg[b + 5]; o[k++] = seg[b + 6];
    }
    gl.useProgram(this.line);
    gl.uniform1f(gl.getUniformLocation(this.line, "uF"), this.f);
    gl.uniform1f(gl.getUniformLocation(this.line, "uAsp"), asp);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.lineBuf);
    gl.bufferData(gl.ARRAY_BUFFER, o.subarray(0, k), gl.DYNAMIC_DRAW);
    var apos = gl.getAttribLocation(this.line, "aPos"), acol = gl.getAttribLocation(this.line, "aCol");
    gl.enableVertexAttribArray(apos); gl.vertexAttribPointer(apos, 3, gl.FLOAT, false, 16, 0);
    gl.enableVertexAttribArray(acol); gl.vertexAttribPointer(acol, 1, gl.FLOAT, false, 16, 12);
    gl.drawArrays(gl.LINES, 0, n * 2);
  };
  root.CockpitRenderer = Renderer;
})(typeof self !== "undefined" ? self : this);
