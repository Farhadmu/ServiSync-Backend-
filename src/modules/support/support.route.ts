import { Router } from 'express';
import {
  getTickets,
  getTicketById,
  createTicket,
  addTicketMessage,
  updateTicketStatus,
} from './support.controller';
import { authenticate, authorize } from '../../middlewares/authenticate';
import { validateRequest } from '../../middlewares/validateRequest';
import {
  createTicketSchema,
  addTicketMessageSchema,
  updateTicketStatusSchema,
} from './support.validation';

const router = Router();

router.use(authenticate);

router.get('/', getTickets);
router.get('/:id', getTicketById);
router.post(
  '/',
  authorize('CUSTOMER'),
  validateRequest({ body: createTicketSchema }),
  createTicket
);
router.post(
  '/:id/messages',
  validateRequest({ body: addTicketMessageSchema }),
  addTicketMessage
);
router.patch(
  '/:id/status',
  validateRequest({ body: updateTicketStatusSchema }),
  updateTicketStatus
);

export default router;
