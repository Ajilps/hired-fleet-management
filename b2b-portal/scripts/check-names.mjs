import { readdir, readFile } from "node:fs/promises";
async function visit(directory) {
  for (const file of await readdir(directory, { withFileTypes: true })) {
    const path = `${directory}/${file.name}`;
    if (file.isDirectory()) {
      if (!/^[a-z][a-z0-9-]*$/.test(file.name))
        throw new Error(`Invalid directory name: ${path}`);
      await visit(path);
    } else if (/\.[jt]sx?$/.test(file.name)) {
      const isComponent =
        file.name.endsWith(".tsx") && !file.name.includes(".test.");
      if (
        isComponent &&
        file.name !== "main.tsx" &&
        !/^[A-Z][A-Za-z0-9]*\.tsx$/.test(file.name)
      )
        throw new Error(`Invalid component filename: ${path}`);
      if (
        !isComponent &&
        !/^(?:[a-z][a-z0-9-]*|[A-Z][A-Za-z0-9]*\.test)(?:\.test)?\.[jt]sx?$/.test(
          file.name,
        )
      )
        throw new Error(`Invalid source filename: ${path}`);
      if (
        isComponent &&
        file.name !== "main.tsx" &&
        !(await readFile(path, "utf8")).includes(
          `function ${file.name.slice(0, -4)}(`,
        )
      )
        throw new Error(`Component name must match file: ${path}`);
    }
  }
}
await visit("src");
console.log("Source naming checks passed.");
