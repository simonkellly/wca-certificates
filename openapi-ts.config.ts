import { defineConfig } from "@hey-api/openapi-ts"

export default defineConfig({
  input: "./openapi/wca.yaml",
  output: { path: "./src/wca-api/openapiClient", entryFile: true },
  plugins: [
    "@hey-api/typescript",
    { name: "@hey-api/client-fetch", baseUrl: false },
    { name: "@hey-api/sdk", client: false },
  ],
})
