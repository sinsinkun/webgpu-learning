const readmef = Bun.file("README.md");
const readme = await readmef.text();

console.log("Starting server on port 3001");
const server = Bun.serve({
  port: 3001,
  development: true,
  fetch(req: Request): Response | Promise<Response> {
    const url = new URL(req.url);
    if (!url.pathname.includes("favicon.ico")) console.log("request: ", req.url);

    // webgpu routes
    if (RegExp(/\/webgpu\/.+\..+/g).test(url.pathname)) {
      const split: Array<String> = url.pathname.split("/");
      const fileName = split[split.length - 1];
      const file = Bun.file(`./webgpu/${fileName}`);
      return file.exists().then(
        () => new Response(file), 
        () => new Response("Err: File not found", { status:404 })
      );
    }
    else if (url.pathname === '/webgpu') return new Response(Bun.file("./webgpu/index.html"));

    // test routes
    else if (url.pathname === '/readme') return new Response(readme, { status:302, statusText:'MOCK' });
    else if (url.pathname === '/error') throw new Error("Hit server error");
    else if (url.pathname === '/stop') {
      server.stop();
      return new Response('End of life');
    }

    // catch all resposne
    return new Response("Hello World!");
  },
})
