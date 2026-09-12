import { PasswordService } from './password.service';

describe('PasswordService', () => {
  const service = new PasswordService();

  it('round-trips a hashed password and rejects a wrong one', async () => {
    const hash = await service.hash('Str0ng!Pass');

    expect(hash).not.toContain('Str0ng!Pass');
    await expect(service.verify('Str0ng!Pass', hash)).resolves.toBe(true);
    await expect(service.verify('wrong', hash)).resolves.toBe(false);
  });
});
