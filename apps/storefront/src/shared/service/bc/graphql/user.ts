import B3Request from '../../request/b3Fetch';

// Omitted entirely when no id is configured: the newline and indent live inside the
// branch, so an un-opted store's query text is byte-identical to what it sent before
// this feature existed. The id is Number.isInteger-checked by its caller.
const tierAttributeSelection = (tierAttributeId?: number) =>
  tierAttributeId === undefined
    ? ''
    : `
    attributes {
      loyaltyTier: attribute(entityId: ${tierAttributeId}) {
        entityId,
        name,
        value,
      }
    }`;

const getCustomer = (tierAttributeId?: number) => `query customer {
  customer{
    entityId,
    phone,
    firstName,
    lastName,
    email,
    customerGroupId,${tierAttributeSelection(tierAttributeId)}
  }
}`;

const getCustomerInfo = (tierAttributeId?: number) =>
  B3Request.graphqlBCProxy({
    query: getCustomer(tierAttributeId),
  });

export { getCustomerInfo };
