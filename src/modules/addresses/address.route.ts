import { Router } from 'express';
import {
  getMyAddresses,
  createAddress,
  updateAddress,
  setDefaultAddress,
  deleteAddress,
} from './address.controller';
import { authenticate, authorize } from '../../middlewares/authenticate';
import { validateRequest } from '../../middlewares/validateRequest';
import { createAddressSchema, updateAddressSchema } from './address.validation';

const router = Router();

router.use(authenticate);
router.use(authorize('CUSTOMER'));

router.get('/', getMyAddresses);
router.post('/', validateRequest({ body: createAddressSchema }), createAddress);
router.patch('/:id', validateRequest({ body: updateAddressSchema }), updateAddress);
router.patch('/:id/default', setDefaultAddress);
router.delete('/:id', deleteAddress);

export default router;
