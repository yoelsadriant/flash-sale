import serverless from "serverless-http";
import { buildApp } from "./app";

const app = buildApp();

export const handler = serverless(app);
export { app };
