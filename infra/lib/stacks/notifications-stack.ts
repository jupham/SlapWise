import * as cdk from 'aws-cdk-lib';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as pinpoint from 'aws-cdk-lib/aws-pinpoint';
import { Construct } from 'constructs';

export class NotificationsStack extends cdk.Stack {
  public readonly snsTopic: sns.Topic;
  public readonly pinpointApp: pinpoint.CfnApp;

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    this.snsTopic = new sns.Topic(this, 'SlapTrackerNotificationsTopic', {
      topicName: 'SlapTrackerNotifications',
      displayName: 'SlapWise Notifications',
    });

    this.pinpointApp = new pinpoint.CfnApp(this, 'SlapTrackerPinpointApp', {
      name: 'SlapWise',
    });

    new cdk.CfnOutput(this, 'SnsTopicArn', {
      value: this.snsTopic.topicArn,
      exportName: 'SlapTrackerSnsTopicArn',
    });

    new cdk.CfnOutput(this, 'PinpointAppId', {
      value: this.pinpointApp.ref,
      exportName: 'SlapTrackerPinpointAppId',
    });
  }
}
