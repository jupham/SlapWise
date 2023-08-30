part of 'account_cubit.dart';

sealed class AccountState extends Equatable {
  const AccountState();

  @override
  List<Object> get props => [];
}

final class AccountInitial extends AccountState {
  @override
  List<Object> get props => [];
}

final class AccountLoading extends AccountState {
  @override
  List<Object> get props => [];
}

final class AccountLoaded extends AccountState {
  const AccountLoaded(this.account);
  final Account account;
  
  @override
  List<Object> get props => [];
}

final class AccontError extends AccountState {
  @override
  List<Object> get props => [];
}

