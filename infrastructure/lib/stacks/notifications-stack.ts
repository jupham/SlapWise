import * as cdk from 'aws-cdk-lib';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as pinpoint from 'aws-cdk-lib/aws-pinpoint';
import { Construct } from 'constructs';

export interface NotificationsStackProps extends cdk.StackProps {
  stage: string;
}

export class NotificationsStack extends cdk.Stack {
  public readonly snsTopic: sns.Topic;
  public readonly pinpointApp: pinpoint.CfnApp;

  constructor(scope: Construct, id: string, props: NotificationsStackProps) {
    super(scope, id, props);
    const { stage } = props;

    this.snsTopic = new sns.Topic(this, 'SlapTrackerNotificationsTopic', {
      topicName: `${stage}-SlapTrackerNotifications`,
      displayName: 'SlapWise Notifications',
    });

    this.pinpointApp = new pinpoint.CfnApp(this, 'SlapTrackerPinpointApp', {
      name: `${stage}-SlapWise`,
    });

    new cdk.CfnOutput(this, 'SnsTopicArn', {
      value: this.snsTopic.topicArn,
      exportName: `${stage}-SlapTrackerSnsTopicArn`,
    });

    new cdk.CfnOutput(this, 'PinpointAppId', {
      value: this.pinpointApp.ref,
      exportName: `${stage}-SlapTrackerPinpointAppId`,
    });
  }
}
