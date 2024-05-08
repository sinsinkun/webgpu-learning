console.log("Starting server on port 3001");

Bun.serve({
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
    if (url.pathname === '/') return new Response(Bun.file("./index.html"));

    // catch all response
    return new Response("Page not found", { status:404 });
  },
});
