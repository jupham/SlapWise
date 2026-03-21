import * as cdk from 'aws-cdk-lib';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import { Construct } from 'constructs';

export interface ApiGatewayStackProps extends cdk.StackProps {
  userPool: cognito.UserPool;
  createGroupFn: lambda.Function;
  joinGroupFn: lambda.Function;
}

export class ApiGatewayStack extends cdk.Stack {
  public readonly api: apigateway.RestApi;

  constructor(scope: Construct, id: string, props: ApiGatewayStackProps) {
    super(scope, id, props);

    const { userPool, createGroupFn, joinGroupFn } = props;

    this.api = new apigateway.RestApi(this, 'SlapTrackerRestApi', {
      restApiName: 'SlapTrackerApi',
      description: 'SlapWise REST API for group management',
      deployOptions: {
        stageName: 'prod',
        loggingLevel: apigateway.MethodLoggingLevel.ERROR,
      },
      defaultCorsPreflightOptions: {
        allowOrigins: apigateway.Cors.ALL_ORIGINS,
        allowMethods: apigateway.Cors.ALL_METHODS,
        allowHeaders: ['Content-Type', 'Authorization'],
      },
    });

    const cognitoAuthorizer = new apigateway.CognitoUserPoolsAuthorizer(
      this,
      'SlapTrackerCognitoAuthorizer',
      {
        cognitoUserPools: [userPool],
        authorizerName: 'SlapTrackerCognitoAuthorizer',
        identitySource: 'method.request.header.Authorization',
      }
    );

    const authMethodOptions: apigateway.MethodOptions = {
      authorizer: cognitoAuthorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO,
    };

    // POST /groups
    const groupsResource = this.api.root.addResource('groups');
    groupsResource.addMethod(
      'POST',
      new apigateway.LambdaIntegration(createGroupFn),
      authMethodOptions
    );

    // POST /groups/join
    const joinResource = groupsResource.addResource('join');
    joinResource.addMethod(
      'POST',
      new apigateway.LambdaIntegration(joinGroupFn),
      authMethodOptions
    );

    new cdk.CfnOutput(this, 'ApiGatewayEndpoint', {
      value: this.api.url,
      exportName: 'SlapTrackerApiGatewayEndpoint',
    });
  }
}
