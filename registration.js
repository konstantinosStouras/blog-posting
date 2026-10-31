export const isUniversityEmail = value => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || '').trim());

export function registrationProfile(data, teacher = false) {
  const firstName = String(data.firstName || '').trim();
  const lastName = String(data.lastName || '').trim();
  const contactEmail = String(data.universityEmail || data.ucdEmail || data.contactEmail || data.email || '').trim().toLowerCase();
  const affiliation = String(data.affiliation || '').trim();
  const studentId = teacher ? '' : String(data.studentId || '').trim();
  if (!firstName || !lastName) throw Error('Enter your first and last name.');
  if (firstName.length > 80 || lastName.length > 80) throw Error('Names must be at most 80 characters.');
  if (!isUniversityEmail(contactEmail)) throw Error('Enter your university email address.');
  if (!affiliation || affiliation.length > 200) throw Error('Enter your school or university (up to 200 characters).');
  if (!teacher && (!studentId || studentId.length > 40)) throw Error('Enter your university ID (up to 40 characters).');
  return {firstName, lastName, contactEmail, affiliation, studentId, registrationKind: teacher ? 'instructor' : 'student'};
}
