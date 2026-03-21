import { APIGatewayProxyHandler } from 'aws-lambda';

// Stub: full implementation in task 4.1
export const handler: APIGatewayProxyHandler = async (_event) => {
  return {
    statusCode: 501,
    body: JSON.stringify({ message: 'Not implemented' }),
  };
};
