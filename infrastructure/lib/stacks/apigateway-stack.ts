import * as cdk from 'aws-cdk-lib';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import { Construct } from 'constructs';

export interface ApiGatewayStackProps extends cdk.StackProps {
  stage: string;
  userPool: cognito.UserPool;
  createGroupFn: lambda.Function;
  joinGroupFn: lambda.Function;
  getGroupFn: lambda.Function;
  getGroupsFn: lambda.Function;
  deleteGroupFn: lambda.Function;
}

export class ApiGatewayStack extends cdk.Stack {
  public readonly api: apigateway.RestApi;

  constructor(scope: Construct, id: string, props: ApiGatewayStackProps) {
    super(scope, id, props);

    const { stage, userPool, createGroupFn, joinGroupFn, getGroupFn, getGroupsFn, deleteGroupFn } = props;

    // Required account-level setting: CloudWatch Logs role for API Gateway
    const cloudWatchRole = new iam.Role(this, 'ApiGatewayCloudWatchRole', {
      assumedBy: new iam.ServicePrincipal('apigateway.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName(
          'service-role/AmazonAPIGatewayPushToCloudWatchLogs'
        ),
      ],
    });

    new apigateway.CfnAccount(this, 'ApiGatewayAccount', {
      cloudWatchRoleArn: cloudWatchRole.roleArn,
    });

    this.api = new apigateway.RestApi(this, 'SlapTrackerRestApi', {
      restApiName: `${stage}-SlapTrackerApi`,
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

    // Ensure account setting is applied before the stage is created
    this.api.node.addDependency(cloudWatchRole);

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

    // GET /groups + POST /groups
    const groupsResource = this.api.root.addResource('groups');
    groupsResource.addMethod(
      'GET',
      new apigateway.LambdaIntegration(getGroupsFn),
      authMethodOptions
    );
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

    // DELETE /groups/{groupId}
    const groupResource = groupsResource.addResource('{groupId}');
    groupResource.addMethod(
      'GET',
      new apigateway.LambdaIntegration(getGroupFn),
      authMethodOptions
    );
    groupResource.addMethod(
      'DELETE',
      new apigateway.LambdaIntegration(deleteGroupFn),
      authMethodOptions
    );

    new cdk.CfnOutput(this, 'ApiGatewayEndpoint', {
      value: this.api.url,
      exportName: `${stage}-SlapTrackerApiGatewayEndpoint`,
    });
  }
}
