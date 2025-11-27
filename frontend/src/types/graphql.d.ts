interface DocumentTypeDecoration<TResult, TVariables> {
  __apiType?: (variables: TVariables) => TResult;
}
