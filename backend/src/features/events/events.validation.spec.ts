import { ArgumentMetadata, BadRequestException } from '@nestjs/common';
import { createGlobalValidationPipe } from '../../core/pipes/global-validation.pipe';
import { CreateEventDto } from './dto/create-event.dto';
import { CreateEventTypeDto } from './dto/create-event-type.dto';
import { CreateEventCategoryDto } from './dto/create-event-category.dto';
import { CreateEventSubcategoryDto } from './dto/create-event-subcategory.dto';

describe('Events validation', () => {
  // Même configuration que l'API (main.ts).
  const pipe = createGlobalValidationPipe();
  // Format réel : `message` = liste de phrases « <propriété> <contrainte> ».
  const messagesOf = (error: BadRequestException): string[] => (error.getResponse() as any).message;

  const expectValidationError = async (payload: unknown, metatype: ArgumentMetadata['metatype']) => {
    try {
      await pipe.transform(payload, { metatype } as ArgumentMetadata);
      throw new Error('Expected validation error');
    } catch (error) {
      expect(error).toBeInstanceOf(BadRequestException);
      return error as BadRequestException;
    }
  };

  describe('CreateEventDto', () => {
    it('rejects invalid eventDate', async () => {
      const error = await expectValidationError(
        { name: 'Test Event', eventDate: 'not-a-date' },
        CreateEventDto,
      );

      expect(messagesOf(error)).toEqual(
        expect.arrayContaining([expect.stringMatching(/^eventDate .*must be a valid ISO 8601 date string/)]),
      );
    });

    it('rejects invalid numberOfSessions type', async () => {
      const error = await expectValidationError(
        { name: 'Test Event', eventDate: '2026-03-13', numberOfSessions: 'abc' },
        CreateEventDto,
      );

      expect(messagesOf(error)).toEqual(expect.arrayContaining([expect.stringMatching(/^numberOfSessions /)]));
    });

    it('accepts a valid event payload', async () => {
      const result = await pipe.transform(
        {
          name: 'Test Event',
          eventDate: '2026-03-13',
          eventTypeId: 'type-1',
          eventCategoryId: 'cat-1',
          eventSubcategoryId: 'sub-1',
        },
        { metatype: CreateEventDto } as ArgumentMetadata,
      );

      expect(result).toBeDefined();
    });

    it('accepts sessions as an array', async () => {
      const result = await pipe.transform(
        {
          name: 'Test Event',
          eventDate: '2026-03-13',
          sessions: [{ time: '14:00', duration: 120 }],
        },
        { metatype: CreateEventDto } as ArgumentMetadata,
      );

      expect(result).toBeDefined();
      expect(result.sessions).toEqual([{ time: '14:00', duration: 120 }]);
    });

    it('accepts sessions as an empty array', async () => {
      const result = await pipe.transform(
        {
          name: 'Test Event',
          eventDate: '2026-03-13',
          sessions: [],
        },
        { metatype: CreateEventDto } as ArgumentMetadata,
      );

      expect(result).toBeDefined();
      expect(result.sessions).toEqual([]);
    });

    it('rejects sessions as a string', async () => {
      const error = await expectValidationError(
        { name: 'Test Event', eventDate: '2026-03-13', sessions: 'invalid' },
        CreateEventDto,
      );

      expect(messagesOf(error)).toEqual(expect.arrayContaining([expect.stringMatching(/^sessions /)]));
    });
  });

  describe('CreateEventTypeDto', () => {
    it('rejects empty name', async () => {
      const error = await expectValidationError({ name: '' }, CreateEventTypeDto);

      expect(messagesOf(error)).toEqual(expect.arrayContaining([expect.stringMatching(/^name /)]));
    });
  });

  describe('CreateEventCategoryDto', () => {
    it('rejects missing eventTypeId', async () => {
      const error = await expectValidationError({ name: 'Music' }, CreateEventCategoryDto);

      expect(messagesOf(error)).toEqual(expect.arrayContaining([expect.stringMatching(/^eventTypeId /)]));
    });

    it('accepts valid category payload', async () => {
      const result = await pipe.transform(
        { name: 'Music', eventTypeId: 'type-1' },
        { metatype: CreateEventCategoryDto } as ArgumentMetadata,
      );

      expect(result).toBeDefined();
    });
  });

  describe('CreateEventSubcategoryDto', () => {
    it('accepts valid subcategory payload', async () => {
      const result = await pipe.transform(
        { name: 'Rock', eventCategoryId: 'cat-1' },
        { metatype: CreateEventSubcategoryDto } as ArgumentMetadata,
      );

      expect(result).toBeDefined();
    });

    it('accepts valid subcategory payload with categoryId alias', async () => {
      const result = await pipe.transform(
        { name: 'Race F1', categoryId: 'cat-1' },
        { metatype: CreateEventSubcategoryDto } as ArgumentMetadata,
      );

      expect(result).toBeDefined();
      expect((result as CreateEventSubcategoryDto).categoryId).toBe('cat-1');
    });
  });
});
