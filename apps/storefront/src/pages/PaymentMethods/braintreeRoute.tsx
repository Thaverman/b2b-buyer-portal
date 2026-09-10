import PaymentMethods from '.';

// A wrapper rather than a prop threaded through routesMap: that map is typed as
// components taking PageProps, and this keeps the page decoupled from route strings.
function PaymentMethodsBraintree() {
  return <PaymentMethods variant="braintree" />;
}

export default PaymentMethodsBraintree;
