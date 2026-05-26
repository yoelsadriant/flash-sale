import type { Handler } from "aws-lambda";
import serverless from "serverless-http";
import { buildApp } from "./app";

type ServerlessHandler = ReturnType<typeof serverless>;

let handlerPromise: Promise<ServerlessHandler> | null = null;

function getHandler(): Promise<ServerlessHandler> {
  return (handlerPromise ??= buildApp().then((app) => serverless(app)));
}

export const handler: Handler = async (event, context) => {
  const h = await getHandler();
  return h(event, context);
};
