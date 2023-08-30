import 'dart:async';
import 'package:amplify_api/amplify_api.dart';
import 'package:amplify_flutter/amplify_flutter.dart';
import 'package:slapwise/models/models.dart';
import 'package:slapwise/amplify_models/ModelProvider.dart' as amplify;


class AccountRepository {
  Account? _account;

  Future<Account?> getAccount(String id) async {
    if (_account != null) return _account;
    try {
      final result = await Amplify.Auth.fetchUserAttributes();

      final request = ModelQueries.get(
        amplify.Account.classType,
        amplify.AccountModelIdentifier(id: id)
      );
      final response = await Amplify.API.query(request: request).response;
      final account = response.data;
      if (account == null) {
        safePrint('errors: ${response.errors}');
      }
      return Account(account!.id, account.emailAddress, account.firstName, account.lastName, account.hasBeenReadIn ?? false);
    } on ApiException catch (e) {
      safePrint('Query failed: $e');
      return null;
    }
  }
}
