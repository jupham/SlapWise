import * as cdk from 'aws-cdk-lib';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import { Construct } from 'constructs';

export interface CognitoStackProps extends cdk.StackProps {
  stage: string;
  preSignUpFn: lambda.Function;
  postConfirmationFn: lambda.Function;
}

export class CognitoStack extends cdk.Stack {
  public readonly userPool: cognito.UserPool;
  public readonly userPoolClient: cognito.UserPoolClient;
  public readonly identityPool: cognito.CfnIdentityPool;

  constructor(scope: Construct, id: string, props: CognitoStackProps) {
    super(scope, id, props);

    const { stage, preSignUpFn, postConfirmationFn } = props;

    this.userPool = new cognito.UserPool(this, 'SlapTrackerUserPool', {
      userPoolName: `${stage}-SlapTrackerUserPool`,
      selfSignUpEnabled: true,
      signInAliases: { email: true },
      autoVerify: { email: true },
      standardAttributes: {
        email: { required: true, mutable: false },
        preferredUsername: { required: false, mutable: true },
      },
      customAttributes: {
        username: new cognito.StringAttribute({ mutable: false }),
      },
      passwordPolicy: {
        minLength: 8,
        requireLowercase: true,
        requireUppercase: true,
        requireDigits: true,
        requireSymbols: false,
      },
      accountRecovery: cognito.AccountRecovery.EMAIL_ONLY,
      lambdaTriggers: {
        preSignUp: preSignUpFn,
        postConfirmation: postConfirmationFn,
      },
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    this.userPoolClient = new cognito.UserPoolClient(this, 'SlapTrackerUserPoolClient', {
      userPool: this.userPool,
      userPoolClientName: `${stage}-SlapTrackerMobileClient`,
      authFlows: {
        userSrp: true,
        userPassword: false,
      },
      generateSecret: false,
      oAuth: {
        flows: { authorizationCodeGrant: true },
        scopes: [cognito.OAuthScope.EMAIL, cognito.OAuthScope.OPENID, cognito.OAuthScope.PROFILE],
      },
    });

    this.identityPool = new cognito.CfnIdentityPool(this, 'SlapTrackerIdentityPool', {
      identityPoolName: `${stage}-SlapTrackerIdentityPool`,
      allowUnauthenticatedIdentities: false,
      cognitoIdentityProviders: [
        {
          clientId: this.userPoolClient.userPoolClientId,
          providerName: this.userPool.userPoolProviderName,
        },
      ],
    });

    // IAM role for authenticated users
    const authenticatedRole = new iam.Role(this, 'CognitoAuthenticatedRole', {
      assumedBy: new iam.FederatedPrincipal(
        'cognito-identity.amazonaws.com',
        {
          StringEquals: { 'cognito-identity.amazonaws.com:aud': this.identityPool.ref },
          'ForAnyValue:StringLike': { 'cognito-identity.amazonaws.com:amr': 'authenticated' },
        },
        'sts:AssumeRoleWithWebIdentity'
      ),
    });

    new cognito.CfnIdentityPoolRoleAttachment(this, 'IdentityPoolRoleAttachment', {
      identityPoolId: this.identityPool.ref,
      roles: {
        authenticated: authenticatedRole.roleArn,
      },
    });

    new cdk.CfnOutput(this, 'UserPoolId', {
      value: this.userPool.userPoolId,
      exportName: `${stage}-SlapTrackerUserPoolId`,
    });

    new cdk.CfnOutput(this, 'UserPoolClientId', {
      value: this.userPoolClient.userPoolClientId,
      exportName: `${stage}-SlapTrackerUserPoolClientId`,
    });

    new cdk.CfnOutput(this, 'IdentityPoolId', {
      value: this.identityPool.ref,
      exportName: `${stage}-SlapTrackerIdentityPoolId`,
    });

    new cdk.CfnOutput(this, 'UserPoolRegion', {
      value: this.region,
      exportName: `${stage}-SlapTrackerUserPoolRegion`,
    });
  }
}
