# Etapa de Build
FROM maven:3.9.6-eclipse-temurin-17 AS build
COPY . .
RUN mvn clean package -DskipTests

# Etapa de Execução
FROM eclipse-temurin:17-jdk-alpine
COPY --from=build /target/farmacia-sistema-0.0.1-SNAPSHOT.jar app.jar
EXPOSE 8080
ENTRYPOINT ["java", "-jar", "app.jar"]