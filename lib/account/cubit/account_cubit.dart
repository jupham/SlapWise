import 'package:bloc/bloc.dart';
import 'package:equatable/equatable.dart';
import 'package:slapwise/repositories/account_repository.dart';

import '../../models/account.dart';

part 'account_state.dart';

class AccountCubit extends Cubit<AccountState> {
  AccountCubit({required this.repository}) : super(AccountInitial()) {
    getAccount();
  }

  final AccountRepository repository;

  void getAccount() async {
    try {
      emit(AccountLoading());

      final account = await repository.getAccount();

      if (account == null) {
        throw 'Account is null';
      }

      emit(AccountLoaded(account));

    } catch (e) {
      emit(AccontError());
    }
  }
}
